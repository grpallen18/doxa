// Supabase Edge Function: detect_disputes.
// Question-scoped Dispute detection (definitional + intra-Question LLM pairs).
// Env: NEO4J_*, OPENAI_API_KEY. Body: { dry_run?, limit?, question_uid?, force?, skip_llm? }

import { corsHeaders, json, clampInt, requireInternalAuth } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { ESTABLISH_MIN_CONFIDENCE } from "../../../../lib/debate/qualify-controversy.ts";
import type { AnswerAssignment } from "../../../../lib/debate/qualify-controversy.ts";
import {
  classifyIntraQuestionPair,
  disputeUidFromPair,
  DISPUTE_SCHEMA_VERSION,
  evaluateDefinitionalDispute,
  INTRA_PAIR_MIN_CONFIDENCE,
  isDisputeRelationshipKind,
} from "../../../../lib/debate/detect-dispute.ts";

const DEFAULT_LIMIT = 15;
const MAX_PAIRS_PER_QUESTION = 6;

type QuestionRow = {
  questionUid: string;
  question: string;
  questionType: string | null;
};

type ThesisRow = {
  questionUid: string;
  propUid: string;
  text: string;
  polarity: string;
  confidence: number;
  debateRole: string | null;
};

async function writeDispute(input: {
  uid: string;
  kind: string;
  summary: string;
  questionUid: string;
  propUids: string[];
  decisionUid: string;
  sourceRelUid?: string | null;
  detectionSource: "structural" | "llm";
}): Promise<void> {
  await runCypher(
    `
    MATCH (q:Question {uid: $questionUid})
    MERGE (d:Dispute {uid: $uid})
    SET d.kind = $kind,
        d.summary = $summary,
        d.questionUid = $questionUid,
        d.detectionSource = $detectionSource,
        d.schemaVersion = $schemaVersion,
        d.updatedAt = datetime(),
        d.createdAt = coalesce(d.createdAt, datetime())
    MERGE (d)-[:SURFACES_IN]->(q)
    WITH d
    OPTIONAL MATCH (d)-[old:CONCERNS]->(:Proposition)
    DELETE old
    WITH d
    UNWIND $propUids AS pid
    MATCH (p:Proposition {uid: pid})
    MERGE (d)-[:CONCERNS]->(p)
    WITH d
    MERGE (dec:Decision {uid: $decisionUid})
    SET dec.decisionType = 'dispute',
        dec.kind = $kind,
        dec.status = 'accepted',
        dec.actor = 'system',
        dec.sourceRelationshipDecisionUid = $sourceRelUid,
        dec.createdAt = coalesce(dec.createdAt, datetime()),
        dec.updatedAt = datetime()
    MERGE (d)-[:DECIDED_BY]->(dec)
    MERGE (dec)-[:ABOUT]->(d)
    `,
    {
      uid: input.uid,
      kind: input.kind,
      summary: input.summary,
      questionUid: input.questionUid,
      propUids: input.propUids,
      schemaVersion: DISPUTE_SCHEMA_VERSION,
      decisionUid: input.decisionUid,
      sourceRelUid: input.sourceRelUid ?? null,
      detectionSource: input.detectionSource,
    }
  );
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const skipLlm = Boolean(body.skip_llm ?? false);
  const limit = clampInt(body.limit, 1, 50, DEFAULT_LIMIT);
  const questionUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";
  const force = Boolean(body.force ?? false);

  const questions = await runCypher<QuestionRow>(
    `
    MATCH (q:Question)
    WHERE ($questionUid = '' OR q.uid = $questionUid)
      AND ($force = true OR coalesce(q.questionType, '') = 'definitional')
    OPTIONAL MATCH (p:Proposition)-[a:ANSWERS]->(q)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    WITH q, count(DISTINCT p) AS thesisCount
    WHERE thesisCount >= 2 OR $force = true
    RETURN q.uid AS questionUid,
           q.question AS question,
           coalesce(q.questionType, 'unknown') AS questionType
    ORDER BY q.uid
    LIMIT $limit
    `,
    {
      questionUid,
      force,
      minConf: ESTABLISH_MIN_CONFIDENCE,
      limit: neoInt(limit),
    }
  );

  if (!questions.length) {
    return json({ ok: true, dry_run: dryRun, scanned: 0, written: 0, llm_pairs: 0 });
  }

  const uids = questions.map((q) => q.questionUid);
  const theses = await runCypher<ThesisRow>(
    `
    UNWIND $uids AS quid
    MATCH (q:Question {uid: quid})<-[a:ANSWERS]-(p:Proposition)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    RETURN q.uid AS questionUid,
           p.uid AS propUid,
           coalesce(p.text, p.normalizedText, '') AS text,
           a.polarity AS polarity,
           coalesce(a.confidence, 0) AS confidence,
           a.debateRole AS debateRole
    `,
    { uids, minConf: ESTABLISH_MIN_CONFIDENCE }
  );

  const thesesByQ = new Map<string, ThesisRow[]>();
  for (const t of theses) {
    const list = thesesByQ.get(t.questionUid) ?? [];
    list.push(t);
    thesesByQ.set(t.questionUid, list);
  }

  const candidates: Array<{
    questionUid: string;
    question: string;
    kind: string;
    summary: string;
    propUids: string[];
    uid: string;
    detectionSource: "structural" | "llm";
  }> = [];

  for (const q of questions) {
    const rows = thesesByQ.get(q.questionUid) ?? [];
    const assignments: AnswerAssignment[] = rows.map((r) => ({
      propUid: r.propUid,
      polarity: r.polarity as AnswerAssignment["polarity"],
      confidence: r.confidence,
      debateRole: r.debateRole,
    }));

    const structural = evaluateDefinitionalDispute({
      questionUid: q.questionUid,
      questionType: q.questionType,
      assignments,
    });
    if (structural.qualifies && structural.memberPropUids.length >= 2) {
      const kind = "definitional_conflict";
      const uid = disputeUidFromPair(
        kind,
        structural.memberPropUids[0],
        structural.memberPropUids[1]
      );
      candidates.push({
        questionUid: q.questionUid,
        question: q.question,
        kind,
        summary: `Definitional dispute over: ${q.question}`.slice(0, 500),
        propUids: structural.memberPropUids.slice(0, 8),
        uid,
        detectionSource: "structural",
      });
    }
  }

  if (!skipLlm && !dryRun) {
    const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
    if (apiKey) {
      for (const q of questions) {
        const rows = (thesesByQ.get(q.questionUid) ?? []).filter((r) => r.text.trim());
        let pairs = 0;
        for (let i = 0; i < rows.length && pairs < MAX_PAIRS_PER_QUESTION; i++) {
          for (let j = i + 1; j < rows.length && pairs < MAX_PAIRS_PER_QUESTION; j++) {
            pairs += 1;
            try {
              const result = await classifyIntraQuestionPair(
                apiKey,
                q.question,
                rows[i].text,
                rows[j].text,
                model
              );
              if (
                !isDisputeRelationshipKind(result.kind) ||
                result.confidence < INTRA_PAIR_MIN_CONFIDENCE
              ) {
                continue;
              }
              const uid = disputeUidFromPair(result.kind, rows[i].propUid, rows[j].propUid);
              if (candidates.some((c) => c.uid === uid)) continue;
              candidates.push({
                questionUid: q.questionUid,
                question: q.question,
                kind: result.kind,
                summary: result.rationale.slice(0, 500),
                propUids: [rows[i].propUid, rows[j].propUid],
                uid,
                detectionSource: "llm",
              });
            } catch {
              /* skip pair on LLM failure */
            }
          }
        }
      }
    }
  }

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      scanned: questions.length,
      dispute_candidates: candidates.length,
    });
  }

  const activeByQuestion = new Map<string, string[]>();
  let written = 0;

  for (const c of candidates) {
    const list = activeByQuestion.get(c.questionUid) ?? [];
    list.push(c.uid);
    activeByQuestion.set(c.questionUid, list);
    const decisionUid = `dspdec:${c.uid}`.slice(0, 200);
    await writeDispute({
      uid: c.uid,
      kind: c.kind,
      summary: c.summary,
      questionUid: c.questionUid,
      propUids: c.propUids,
      decisionUid,
      detectionSource: c.detectionSource,
    });
    written += 1;
  }

  for (const quid of questions.map((q) => q.questionUid)) {
    const uids = activeByQuestion.get(quid) ?? [];
    await runCypher(
      `
      MATCH (q:Question {uid: $quid})<-[:SURFACES_IN]-(d:Dispute)
      WHERE NOT d.uid IN $activeUids
        AND ($skipLlm = false OR coalesce(d.detectionSource, 'structural') = 'structural')
      OPTIONAL MATCH (d)-[:DECIDED_BY]->(dec:Decision {decisionType: 'dispute'})
      DETACH DELETE dec, d
      `,
      {
        quid,
        activeUids: uids.length ? uids : ["__none__"],
        skipLlm,
      }
    );
  }

  return json({
    ok: true,
    scanned: questions.length,
    written,
    llm_pairs: candidates.filter((c) => c.kind !== "definitional_conflict").length,
    questions_touched: questions.length,
  });
};
