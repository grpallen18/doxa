// Supabase Edge Function: qualify_controversies.
// Structural incompatibility → Controversy overlay on Question (Session 3).
// Env: NEO4J_*. Body: { dry_run?, limit?, question_uid?, force? }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import {
  CONTROVERSY_SCHEMA_VERSION,
  ESTABLISH_MIN_CONFIDENCE,
  controversyUidFromQuestion,
  evaluateQuestionControversy,
  type AnswerAssignment,
} from "../../../../lib/debate/qualify-controversy.ts";

const DEFAULT_LIMIT = 30;
const PROMPT_VERSION = "qualify-v1";

type QuestionRow = {
  questionUid: string;
  question: string;
  questionType: string | null;
  answerExclusivity: string | null;
};

type AssignmentRow = {
  questionUid: string;
  propUid: string;
  polarity: string;
  confidence: number;
  debateRole: string | null;
};

type VetoRow = {
  questionUid: string;
  label: string | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const force = Boolean(body.force ?? false);
  const limit = clampInt(body.limit, 1, 100, DEFAULT_LIMIT);
  const onlyUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";
  const propUid =
    typeof body.proposition_uid === "string" ? body.proposition_uid.trim() : "";

  let questionFilter = onlyUid;
  if (!questionFilter && propUid) {
    const linked = await runCypher<{ questionUid: string }>(
      `
      MATCH (p:Proposition {uid: $propUid})-[:ANSWERS]->(q:Question)
      RETURN q.uid AS questionUid
      LIMIT 1
      `,
      { propUid }
    );
    questionFilter = linked[0]?.questionUid ?? "";
  }

  const questions = await runCypher<QuestionRow>(
    `
    MATCH (q:Question)
    WHERE ($questionFilter = '' OR q.uid = $questionFilter)
    OPTIONAL MATCH (p:Proposition)-[a:ANSWERS]->(q)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'NONE'
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    WITH q, count(DISTINCT p) AS thesisCount
    WHERE thesisCount >= 2 OR $force = true
    RETURN q.uid AS questionUid,
           q.question AS question,
           coalesce(q.questionType, 'unknown') AS questionType,
           coalesce(q.answerExclusivity, 'unknown') AS answerExclusivity
    ORDER BY q.uid
    LIMIT $limit
    `,
    { questionFilter, force, limit: neoInt(limit), minConf: ESTABLISH_MIN_CONFIDENCE }
  );

  if (!questions.length) {
    return json({ ok: true, dry_run: dryRun, scanned: 0, established: 0, revoked: 0, developing: 0 });
  }

  const uids = questions.map((q) => q.questionUid);

  const assignments = await runCypher<AssignmentRow>(
    `
    UNWIND $uids AS quid
    MATCH (q:Question {uid: quid})<-[a:ANSWERS]-(p:Proposition)
    WHERE coalesce(a.debateRole, 'thesis') = 'thesis'
      AND a.polarity IS NOT NULL
      AND a.polarity <> 'NONE'
      AND a.polarity <> 'UNCERTAIN'
      AND coalesce(a.confidence, 0) >= $minConf
    RETURN q.uid AS questionUid,
           p.uid AS propUid,
           a.polarity AS polarity,
           coalesce(a.confidence, 0) AS confidence,
           a.debateRole AS debateRole
    `,
    { uids, minConf: ESTABLISH_MIN_CONFIDENCE }
  );

  const vetoes = await runCypher<VetoRow>(
    `
    UNWIND $uids AS quid
    MATCH (q:Question {uid: quid})<-[:ABOUT]-(d:Decision)
    WHERE d.status = 'quarantined'
      AND d.decisionType IN ['question_match', 'question_answer']
      AND d.label IN ['talking_past', 'orthogonal']
    RETURN q.uid AS questionUid, d.label AS label
    `,
    { uids }
  );

  const assignByQ = new Map<string, AnswerAssignment[]>();
  for (const row of assignments) {
    const list = assignByQ.get(row.questionUid) ?? [];
    list.push({
      propUid: row.propUid,
      polarity: row.polarity as AnswerAssignment["polarity"],
      confidence: row.confidence,
      debateRole: row.debateRole,
    });
    assignByQ.set(row.questionUid, list);
  }

  const vetoByQ = new Map<string, string[]>();
  for (const row of vetoes) {
    if (!row.label) continue;
    const list = vetoByQ.get(row.questionUid) ?? [];
    list.push(row.label);
    vetoByQ.set(row.questionUid, list);
  }

  if (dryRun) {
    let wouldEstablish = 0;
    let wouldRevoke = 0;
    for (const q of questions) {
      const result = evaluateQuestionControversy({
        questionUid: q.questionUid,
        questionType: q.questionType,
        answerExclusivity: q.answerExclusivity,
        assignments: assignByQ.get(q.questionUid) ?? [],
        vetoLabels: vetoByQ.get(q.questionUid),
      });
      if (result.qualifies) wouldEstablish += 1;
      else wouldRevoke += 1;
    }
    return json({
      ok: true,
      dry_run: true,
      scanned: questions.length,
      would_establish: wouldEstablish,
      would_revoke: wouldRevoke,
    });
  }

  let established = 0;
  let revoked = 0;
  let developing = 0;

  for (const q of questions) {
    const result = evaluateQuestionControversy({
      questionUid: q.questionUid,
      questionType: q.questionType,
      answerExclusivity: q.answerExclusivity,
      assignments: assignByQ.get(q.questionUid) ?? [],
      vetoLabels: vetoByQ.get(q.questionUid),
    });

    const ctrUid = controversyUidFromQuestion(q.questionUid);
    const decisionUid = `cqual:${q.questionUid}`.slice(0, 180);

    if (result.qualifies) {
      await runCypher(
        `
        MATCH (q:Question {uid: $questionUid})
        MERGE (c:Controversy {uid: $ctrUid})
        ON CREATE SET c.createdAt = datetime()
        SET c.question = $question,
            c.questionUid = $questionUid,
            c.status = 'established',
            c.confidence = $confidence,
            c.qualifyReason = $reason,
            c.schemaVersion = $schemaVersion,
            c.updatedAt = datetime()
        MERGE (c)-[:ABOUT]->(q)
        SET q.status = 'established',
            q.updatedAt = datetime()
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'controversy_qualify',
            dec.status = 'accepted',
            dec.actor = 'model',
            dec.confidence = $confidence,
            dec.reason = $reason,
            dec.promptVersion = $promptVersion,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(q)
        MERGE (dec)-[:ABOUT]->(c)
        `,
        {
          questionUid: q.questionUid,
          ctrUid,
          question: q.question,
          confidence: result.confidence,
          reason: result.reason,
          schemaVersion: CONTROVERSY_SCHEMA_VERSION,
          decisionUid,
          promptVersion: PROMPT_VERSION,
        }
      );
      established += 1;
    } else {
      await runCypher(
        `
        MATCH (q:Question {uid: $questionUid})
        OPTIONAL MATCH (c:Controversy {uid: $ctrUid})
        DETACH DELETE c
        SET q.status = 'developing',
            q.updatedAt = datetime()
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'controversy_qualify',
            dec.status = 'quarantined',
            dec.actor = 'model',
            dec.confidence = 0.0,
            dec.reason = $reason,
            dec.promptVersion = $promptVersion,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          questionUid: q.questionUid,
          ctrUid,
          decisionUid,
          reason: result.reason,
          promptVersion: PROMPT_VERSION,
        }
      );
      if (result.reason === "insufficient_assignments") developing += 1;
      else revoked += 1;
    }
  }

  return json({
    ok: true,
    scanned: questions.length,
    established,
    revoked,
    developing,
  });
};
