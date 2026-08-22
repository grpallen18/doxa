// Supabase Edge Function: retrieve_or_mint_questions.
// Thesis → candidate CQ → retrieve top-k Questions → same|adjacent|unrelated
// → attach / mint (adjacent mints new CQ) / quarantine (weak/fail only).
// Body: { dry_run?, limit?, proposition_uid?, question_uid?, force?, backfill_adjacent?, reject_noise? }
// backfill_adjacent: mint from stored candidateQuestion on quarantined label=adjacent Decisions.
// reject_noise: mark fail/0-conf/irrelevant question_match|question_answer quarantines as rejected.

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { resolveDebateRole } from "../../../../lib/debate/debate-role.ts";
import {
  EMBEDDING_MODEL,
  QUESTION_SCHEMA_VERSION,
  SAME_MATCH_MIN_CONFIDENCE,
  TOP_K_QUESTIONS,
  cosineSimilarity,
  embedTexts,
  ensureQuestionMark,
  parseExclusivity,
  parseMatchLabel,
  parseQuestionType,
  questionUidFromText,
  resolveMatchLabel,
  type QuestionMatchLabel,
} from "../../../../lib/debate/question-identity.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 10;
const PROMPT_VERSION = "retrieve-mint-v2";
const FETCH_MULTIPLIER = 5;

type PropRow = {
  uid: string;
  text: string;
  speechActs: string[] | null;
  roles: string[] | null;
};

type QuestionRow = {
  uid: string;
  question: string;
  embedding: number[] | null;
};

async function mintCandidateQuestion(
  apiKey: string,
  model: string,
  thesis: string
): Promise<{
  question: string;
  questionType: string;
  exclusivity: string;
  confidence: number;
}> {
  const system = `Generate one contested question that this proposition answers.
Return ONLY JSON: {"question":"...?","questionType":"policy|factual|causal|definitional","exclusivity":"exclusive|compatible|unknown","confidence":0.0-1.0}
Rules:
- question is one specific interrogative people actually argue.
- Do not use a bare entity/topic label ("Ukraine", "Trump").
- Prefer under-claim: keep the question narrow to what the proposition actually answers.
- exclusivity=exclusive for binary should/shouldn't or primary-cause; compatible for multi-factor causes.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ proposition: thesis }) },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI mint ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return {
    question: ensureQuestionMark(String(parsed.question ?? "").trim()).slice(0, 240),
    questionType: parseQuestionType(parsed.questionType) ?? "factual",
    exclusivity: parseExclusivity(parsed.exclusivity) ?? "unknown",
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

async function adjudicateMatches(
  apiKey: string,
  model: string,
  candidate: string,
  options: Array<{ uid: string; question: string }>
): Promise<Array<{ uid: string; label: QuestionMatchLabel; confidence: number }>> {
  if (!options.length) return [];
  const system = `Compare a candidate contested question to existing registry questions.
Return ONLY JSON: {"matches":[{"uid":"...","label":"same|adjacent|unrelated","confidence":0.0-1.0},...]}
- same = same contested decision; synonym/paraphrase OK (e.g. United States↔Washington, military aid↔weapons to Kyiv)
- adjacent = related topic but a *different* decision (must not merge)
- unrelated = different topic
Always adjacent (never same): "primary cause" vs open "what caused"; policy should-we vs prediction will-X; competence/quality vs should-we; reconstruction financing vs continue military aid; race in admissions vs "is affirmative action fair"
If it is only a wording swap of the same decision → same. Prefer adjacent when the decision criteria differ.`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({ candidate, options }),
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI adjudicate ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { matches?: Array<Record<string, unknown>> } = {};
  try {
    parsed = JSON.parse(raw) as { matches?: Array<Record<string, unknown>> };
  } catch {
    parsed = {};
  }
  const byUid = new Map(options.map((o) => [o.uid, o.question]));
  const out: Array<{ uid: string; label: QuestionMatchLabel; confidence: number }> = [];
  for (const m of parsed.matches ?? []) {
    const uid = String(m.uid ?? "");
    const optionText = byUid.get(uid) ?? "";
    const llmLabel = parseMatchLabel(m.label);
    const confidence =
      typeof m.confidence === "number" && Number.isFinite(m.confidence)
        ? Math.max(0, Math.min(1, m.confidence))
        : 0.5;
    if (!uid) continue;
    const resolved = resolveMatchLabel(candidate, optionText, llmLabel, confidence);
    out.push({ uid, label: resolved.label, confidence: resolved.confidence });
  }
  return out;
}

type MintAttachParams = {
  propUid: string;
  question: string;
  questionType: string;
  exclusivity: string;
  embedding: number[];
  qConfidence: number;
  decisionUid: string;
  label: string;
  adjacentQuestionUid?: string;
  candidateQuestion?: string;
};

/** Mint (or merge) a Question from candidate text and attach ANSWERS. */
async function mintAndAttachQuestion(
  params: MintAttachParams,
  promptVersion: string,
  model: string
): Promise<string> {
  const uid = await questionUidFromText(params.question);
  await runCypher(
    `
    MATCH (p:Proposition {uid: $propUid})
    OPTIONAL MATCH (p)-[old:ANSWERS]->(:Question)
    DELETE old
    MERGE (q:Question {uid: $uid})
    ON CREATE SET
      q.createdAt = datetime(),
      q.status = 'developing',
      q.confidence = $qConfidence
    SET q.question = $question,
        q.questionType = $questionType,
        q.answerExclusivity = $exclusivity,
        q.embedding = $embedding,
        q.schemaVersion = $schemaVersion,
        q.updatedAt = datetime()
    MERGE (dec:Decision {uid: $decisionUid})
    SET dec.decisionType = 'question_mint',
        dec.status = 'accepted',
        dec.actor = 'model',
        dec.confidence = $qConfidence,
        dec.label = $label,
        dec.candidateQuestion = $candidateQuestion,
        dec.adjacentQuestionUid = $adjacentQuestionUid,
        dec.promptVersion = $promptVersion,
        dec.model = $model,
        dec.createdAt = coalesce(dec.createdAt, datetime()),
        dec.updatedAt = datetime()
    MERGE (dec)-[:ABOUT]->(p)
    MERGE (dec)-[:ABOUT]->(q)
    WITH p, q, dec
    OPTIONAL MATCH (adj:Question {uid: $adjacentQuestionUid})
    FOREACH (_ IN CASE WHEN adj IS NULL THEN [] ELSE [1] END |
      MERGE (dec)-[:ABOUT]->(adj)
    )
    WITH p, q, dec
    MERGE (p)-[a:ANSWERS]->(q)
    SET a.debateRole = 'thesis',
        a.polarity = coalesce(a.polarity, 'NONE'),
        a.confidence = $qConfidence,
        a.decisionUid = $decisionUid,
        a.updatedAt = datetime()
    `,
    {
      propUid: params.propUid,
      uid,
      question: params.question,
      questionType: params.questionType,
      exclusivity: params.exclusivity,
      embedding: params.embedding,
      schemaVersion: QUESTION_SCHEMA_VERSION,
      decisionUid: params.decisionUid,
      qConfidence: params.qConfidence,
      label: params.label,
      candidateQuestion: params.candidateQuestion ?? params.question,
      adjacentQuestionUid: params.adjacentQuestionUid ?? "",
      promptVersion,
      model,
    }
  );
  return uid;
}

/** Mark prior adjacent quarantine Decisions for this proposition as consumed. */
async function consumeAdjacentQuarantine(
  propUid: string,
  supersededBy: string
): Promise<void> {
  await runCypher(
    `
    MATCH (p:Proposition {uid: $propUid})<-[:ABOUT]-(dec:Decision)
    WHERE dec.decisionType = 'question_match'
      AND dec.status = 'quarantined'
      AND dec.label = 'adjacent'
    SET dec.status = 'consumed',
        dec.updatedAt = datetime(),
        dec.supersededBy = $supersededBy
    `,
    { propUid, supersededBy }
  );
}

type AdjacentBackfillRow = {
  decisionUid: string;
  propUid: string;
  candidateQuestion: string;
  confidence: number | null;
  adjacentQuestionUid: string | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  if (!OPENAI_API_KEY) return json({ error: "Missing OPENAI_API_KEY" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const force = Boolean(body.force ?? false);
  const backfillAdjacent = Boolean(body.backfill_adjacent ?? false);
  const rejectNoise = Boolean(body.reject_noise ?? false);
  const limit = backfillAdjacent
    ? clampInt(body.limit, 1, 100, 50)
    : clampInt(body.limit, 1, 25, DEFAULT_LIMIT);
  const onlyUid =
    typeof body.proposition_uid === "string" ? body.proposition_uid.trim() : "";
  const questionUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";

  if (rejectNoise) {
    if (dryRun) {
      const pending = await runCypher<{ n: number }>(
        `
        MATCH (d:Decision)
        WHERE d.status = 'quarantined'
          AND d.decisionType IN ['question_match', 'question_answer']
          AND (
            coalesce(d.confidence, 0.0) = 0.0
            OR d.relevant = false
            OR d.label IN ['mint_failed', 'embed_failed', 'adjudicate_failed']
            OR d.rationale = 'classify_failed'
          )
        RETURN count(d) AS n
        `
      );
      return json({
        ok: true,
        dry_run: true,
        reject_noise: true,
        pending: Number(pending[0]?.n ?? 0),
      });
    }
    const updated = await runCypher<{ n: number }>(
      `
      MATCH (d:Decision)
      WHERE d.status = 'quarantined'
        AND d.decisionType IN ['question_match', 'question_answer']
        AND (
          coalesce(d.confidence, 0.0) = 0.0
          OR d.relevant = false
          OR d.label IN ['mint_failed', 'embed_failed', 'adjudicate_failed']
          OR d.rationale = 'classify_failed'
        )
      SET d.status = 'rejected',
          d.updatedAt = datetime(),
          d.rejectedReason = coalesce(d.label, d.rationale, 'noise')
      RETURN count(d) AS n
      `
    );
    return json({
      ok: true,
      reject_noise: true,
      rejected: Number(updated[0]?.n ?? 0),
    });
  }

  if (backfillAdjacent) {
    const rows = await runCypher<AdjacentBackfillRow>(
      `
      MATCH (dec:Decision)
      WHERE dec.status = 'quarantined'
        AND dec.decisionType = 'question_match'
        AND dec.label = 'adjacent'
        AND dec.candidateQuestion IS NOT NULL
        AND trim(dec.candidateQuestion) <> ''
      OPTIONAL MATCH (dec)-[:ABOUT]->(p:Proposition)
      OPTIONAL MATCH (dec)-[:ABOUT]->(q:Question)
      WITH dec, head(collect(DISTINCT p)) AS prop, head(collect(DISTINCT q)) AS adj
      WHERE prop IS NOT NULL
        AND NOT EXISTS {
          MATCH (prop)-[:ANSWERS]->(:Question)
        }
      RETURN dec.uid AS decisionUid,
             prop.uid AS propUid,
             dec.candidateQuestion AS candidateQuestion,
             dec.confidence AS confidence,
             adj.uid AS adjacentQuestionUid
      ORDER BY dec.updatedAt ASC
      LIMIT $limit
      `,
      { limit: neoInt(limit) }
    );

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        backfill_adjacent: true,
        pending: rows.length,
      });
    }

    // Clear adjacent quarantine on props that already have ANSWERS (no remint).
    await runCypher(
      `
      MATCH (dec:Decision)
      WHERE dec.status = 'quarantined'
        AND dec.decisionType = 'question_match'
        AND dec.label = 'adjacent'
      MATCH (dec)-[:ABOUT]->(p:Proposition)
      WHERE EXISTS { MATCH (p)-[:ANSWERS]->(:Question) }
      SET dec.status = 'consumed',
          dec.updatedAt = datetime(),
          dec.supersededBy = 'already_attached'
      `
    );

    let minted = 0;
    let failed = 0;
    let skippedAttached = 0;
    const seenProps = new Set<string>();
    for (const row of rows) {
      if (seenProps.has(row.propUid)) {
        await consumeAdjacentQuarantine(row.propUid, row.decisionUid);
        skippedAttached += 1;
        continue;
      }
      const question = ensureQuestionMark(String(row.candidateQuestion ?? "").trim()).slice(
        0,
        240
      );
      if (!question) {
        failed += 1;
        continue;
      }
      try {
        const [emb] = await embedTexts(OPENAI_API_KEY, [question], EMBEDDING_MODEL);
        if (!emb?.length) {
          failed += 1;
          continue;
        }
        const conf =
          typeof row.confidence === "number" && Number.isFinite(row.confidence)
            ? Math.max(0, Math.min(1, row.confidence))
            : 0.6;
        await mintAndAttachQuestion(
          {
            propUid: row.propUid,
            question,
            questionType: "factual",
            exclusivity: "unknown",
            embedding: emb,
            qConfidence: conf,
            decisionUid: row.decisionUid,
            label: "adjacent_minted",
            adjacentQuestionUid: row.adjacentQuestionUid ?? undefined,
            candidateQuestion: question,
          },
          PROMPT_VERSION,
          MODEL
        );
        seenProps.add(row.propUid);
        await consumeAdjacentQuarantine(row.propUid, row.decisionUid);
        minted += 1;
      } catch {
        failed += 1;
      }
    }

    return json({
      ok: true,
      backfill_adjacent: true,
      scanned: rows.length,
      minted,
      failed,
      skipped_duplicate_prop: skippedAttached,
    });
  }

  if (questionUid && !onlyUid && !force) {
    return json({
      ok: true,
      skipped: true,
      reason: "question_uid_scoped",
      scanned: 0,
      attached: 0,
      minted: 0,
      skipped_props: 0,
    });
  }

  const fetchLimit = Math.min(limit * FETCH_MULTIPLIER, 120);

  const propsRaw = await runCypher<PropRow>(
    `
    MATCH (p:Proposition)
    WHERE ($onlyUid = '' OR p.uid = $onlyUid)
        AND ($force = true OR (
        NOT EXISTS {
          MATCH (p)-[a:ANSWERS]->(:Question)
          WHERE a.decisionUid IS NOT NULL
        }
        AND NOT EXISTS {
          MATCH (d:Decision)-[:ABOUT]->(p)
          WHERE d.decisionType = 'question_match'
            AND d.status IN ['quarantined', 'rejected']
        }
      ))
    OPTIONAL MATCH (u:Utterance)-[:EXPRESSES]->(p)
    OPTIONAL MATCH (:Argument)-[hr:HAS_ROLE]->(p)
    WITH p,
         [x IN collect(DISTINCT u.speechAct) WHERE x IS NOT NULL] AS speechActs,
         [r IN collect(DISTINCT hr.role) WHERE r IS NOT NULL] AS roles
    WHERE any(x IN speechActs WHERE x IN ['prescription','judgment','allegation','prediction'])
       OR any(r IN roles WHERE r IN ['conclusion','objection','rebuttal','prediction'])
    RETURN p.uid AS uid,
           coalesce(p.text, p.normalizedText, '') AS text,
           speechActs,
           roles
    ORDER BY p.uid
    LIMIT $fetchLimit
    `,
    { onlyUid, force, fetchLimit: neoInt(fetchLimit) }
  );

  const props = propsRaw
    .filter(
      (p) =>
        resolveDebateRole({ speechActs: p.speechActs, hasRoles: p.roles }) === "thesis"
    )
    .slice(0, limit);

  const registry = await runCypher<QuestionRow>(
    `
    MATCH (q:Question)
    WHERE q.embedding IS NOT NULL
    RETURN q.uid AS uid, q.question AS question, q.embedding AS embedding
    `
  );

  if (dryRun) {
    const thesisCount = props.filter(
      (p) =>
        resolveDebateRole({ speechActs: p.speechActs, hasRoles: p.roles }) === "thesis"
    ).length;
    return json({
      ok: true,
      dry_run: true,
      pending_props: props.length,
      thesis_candidates: thesisCount,
      registry_size: registry.length,
    });
  }

  let scanned = 0;
  let skipped = 0;
  let attached = 0;
  let minted = 0;
  let quarantined = 0;
  let rejected = 0;

  for (const prop of props) {
    scanned += 1;
    const role = resolveDebateRole({
      speechActs: prop.speechActs,
      hasRoles: prop.roles,
    });
    if (role !== "thesis" || !prop.text.trim()) {
      skipped += 1;
      continue;
    }

    let candidate: Awaited<ReturnType<typeof mintCandidateQuestion>> | null = null;
    try {
      candidate = await mintCandidateQuestion(OPENAI_API_KEY, MODEL, prop.text);
    } catch {
      candidate = null;
    }
    if (!candidate?.question || candidate.confidence < 0.4) {
      const decisionUid = `qmintfail:${prop.uid}`.slice(0, 180);
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_match',
            dec.status = 'rejected',
            dec.actor = 'model',
            dec.confidence = coalesce($confidence, 0.0),
            dec.label = 'mint_failed',
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        `,
        {
          propUid: prop.uid,
          decisionUid,
          confidence: candidate?.confidence ?? 0,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      rejected += 1;
      continue;
    }

    const [candEmb] = await embedTexts(OPENAI_API_KEY, [candidate.question], EMBEDDING_MODEL);
    if (!candEmb?.length) {
      const decisionUid = `qembfail:${prop.uid}`.slice(0, 180);
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_match',
            dec.status = 'rejected',
            dec.actor = 'model',
            dec.confidence = 0.0,
            dec.label = 'embed_failed',
            dec.candidateQuestion = $candidate,
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        `,
        {
          propUid: prop.uid,
          decisionUid,
          candidate: candidate.question,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      rejected += 1;
      continue;
    }

    const ranked = registry
      .map((q) => ({
        uid: q.uid,
        question: q.question,
        score: cosineSimilarity(candEmb, q.embedding ?? []),
      }))
      .filter((q) => q.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K_QUESTIONS);

    let matches: Array<{ uid: string; label: QuestionMatchLabel; confidence: number }> = [];
    let adjudicateFailed = false;
    if (ranked.length) {
      try {
        matches = await adjudicateMatches(
          OPENAI_API_KEY,
          MODEL,
          candidate.question,
          ranked.map((r) => ({ uid: r.uid, question: r.question }))
        );
      } catch {
        matches = [];
        adjudicateFailed = true;
      }
    }

    const labeledUids = new Set(matches.map((m) => m.uid));
    const topUnlabeled = ranked.length > 0 && !labeledUids.has(ranked[0].uid);

    // Fail closed: similar Questions exist but adjudication is incomplete.
    if (ranked.length && (adjudicateFailed || !matches.length || topUnlabeled)) {
      const hit = ranked[0];
      const decisionUid = `qfail:${prop.uid}:${hit.uid}`.slice(0, 180);
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MATCH (q:Question {uid: $questionUid})
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_match',
            dec.status = 'rejected',
            dec.actor = 'model',
            dec.confidence = 0.0,
            dec.label = 'adjudicate_failed',
            dec.candidateQuestion = $candidate,
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: prop.uid,
          questionUid: hit.uid,
          decisionUid,
          candidate: candidate.question,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      rejected += 1;
      continue;
    }

    const sameHits = matches
      .filter((m) => m.label === "same" && m.confidence >= SAME_MATCH_MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence);
    const weakSame = matches
      .filter((m) => m.label === "same" && m.confidence < SAME_MATCH_MIN_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)[0];
    const adjacentBest = matches
      .filter((m) => m.label === "adjacent")
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (sameHits.length) {
      const hit = sameHits[0];
      const decisionUid = `qlink:${prop.uid}:${hit.uid}`.slice(0, 180);
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MATCH (q:Question {uid: $questionUid})
        OPTIONAL MATCH (p)-[old:ANSWERS]->(:Question)
        DELETE old
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_link',
            dec.status = 'accepted',
            dec.actor = 'model',
            dec.confidence = $confidence,
            dec.label = 'same',
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        MERGE (p)-[a:ANSWERS]->(q)
        SET a.debateRole = 'thesis',
            a.polarity = coalesce(a.polarity, 'NONE'),
            a.confidence = $confidence,
            a.decisionUid = $decisionUid,
            a.updatedAt = datetime()
        `,
        {
          propUid: prop.uid,
          questionUid: hit.uid,
          decisionUid,
          confidence: hit.confidence,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      attached += 1;
      await consumeAdjacentQuarantine(prop.uid, decisionUid);
      continue;
    }

    if (adjacentBest) {
      // Adjacent = different decision: mint a new CQ (do not merge with registry hit).
      const uid = await questionUidFromText(candidate.question);
      const decisionUid = `qadjmint:${prop.uid}:${uid}`.slice(0, 180);
      await mintAndAttachQuestion(
        {
          propUid: prop.uid,
          question: candidate.question,
          questionType: candidate.questionType,
          exclusivity: candidate.exclusivity,
          embedding: candEmb,
          qConfidence: candidate.confidence,
          decisionUid,
          label: "adjacent_minted",
          adjacentQuestionUid: adjacentBest.uid,
          candidateQuestion: candidate.question,
        },
        PROMPT_VERSION,
        MODEL
      );
      await consumeAdjacentQuarantine(prop.uid, decisionUid);
      minted += 1;
      registry.push({ uid, question: candidate.question, embedding: candEmb });
      continue;
    }

    // Weak same without meeting attach threshold: quarantine, do not mint.
    if (weakSame) {
      const decisionUid = `qweak:${prop.uid}:${weakSame.uid}`.slice(0, 180);
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})
        MATCH (q:Question {uid: $questionUid})
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_match',
            dec.status = 'quarantined',
            dec.actor = 'model',
            dec.confidence = $confidence,
            dec.label = 'same_weak',
            dec.candidateQuestion = $candidate,
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: prop.uid,
          questionUid: weakSame.uid,
          decisionUid,
          confidence: weakSame.confidence,
          candidate: candidate.question,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      quarantined += 1;
      continue;
    }

    // Mint on miss / all unrelated.
    const uid = await questionUidFromText(candidate.question);
    const decisionUid = `qmint:${prop.uid}:${uid}`.slice(0, 180);
    await mintAndAttachQuestion(
      {
        propUid: prop.uid,
        question: candidate.question,
        questionType: candidate.questionType,
        exclusivity: candidate.exclusivity,
        embedding: candEmb,
        qConfidence: candidate.confidence,
        decisionUid,
        label: "minted",
        candidateQuestion: candidate.question,
      },
      PROMPT_VERSION,
      MODEL
    );
    await consumeAdjacentQuarantine(prop.uid, decisionUid);
    minted += 1;
    registry.push({ uid, question: candidate.question, embedding: candEmb });
  }

  return json({
    ok: true,
    scanned,
    skipped,
    attached,
    minted,
    quarantined,
    rejected,
    registry_size: registry.length,
  });
};
