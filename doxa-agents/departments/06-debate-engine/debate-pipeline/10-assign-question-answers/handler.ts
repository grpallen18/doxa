// Supabase Edge Function: assign_question_answers.
// For thesis props with ANSWERS→Question, set polarity toward the frozen CQ.
// Session 2: theses only. Env: NEO4J_*, OPENAI_API_KEY.
// Body: { dry_run?, limit?, proposition_uid?, question_uid?, force? }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";
import { parsePolarity, type AnswerPolarity } from "../../../../lib/debate/question-identity.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 15;
const PROMPT_VERSION = "assign-answer-v2";
const AUTO_ACCEPT = 0.7;

type Row = {
  propUid: string;
  propText: string;
  questionUid: string;
  question: string;
  questionType: string | null;
  debateRole: string | null;
  polarity: string | null;
  decisionUid: string | null;
};

async function classifyAnswer(
  apiKey: string,
  model: string,
  proposition: string,
  question: string,
  questionType: string
): Promise<{ relevant: boolean; polarity: AnswerPolarity; confidence: number; rationale: string }> {
  const system = `Classify how a proposition answers a frozen contested question.
Return ONLY JSON: {"relevant":true|false,"polarity":"FAVOR|AGAINST|QUALIFY|AFFIRMS|DENIES|UNCERTAIN|NONE","confidence":0.0-1.0,"rationale":"..."}
Rules:
- If the proposition does not answer the question, relevant=false and polarity=NONE.
- Policy questions use FAVOR/AGAINST/QUALIFY.
- Factual questions use AFFIRMS/DENIES/UNCERTAIN.
- Prefer under-claim.
- Honor the provided questionType when choosing polarity vocab.`;
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
          content: JSON.stringify({ proposition, question, questionType }),
        },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
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
    relevant: Boolean(parsed.relevant),
    polarity: parsePolarity(parsed.polarity) ?? "NONE",
    confidence:
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    rationale: String(parsed.rationale ?? "").slice(0, 400),
  };
}

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
  const limit = clampInt(body.limit, 1, 40, DEFAULT_LIMIT);
  const onlyUid =
    typeof body.proposition_uid === "string" ? body.proposition_uid.trim() : "";
  const questionUid =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";

  const rows = await runCypher<Row>(
    `
    MATCH (p:Proposition)-[a:ANSWERS]->(q:Question)
    WHERE ($onlyUid = '' OR p.uid = $onlyUid)
      AND ($questionUid = '' OR q.uid = $questionUid)
      AND coalesce(a.debateRole, 'thesis') = 'thesis'
      AND ($force = true OR NOT EXISTS {
             MATCH (d:Decision)-[:ABOUT]->(p)
             WHERE d.decisionType = 'question_answer'
               AND (d)-[:ABOUT]->(q)
           })
    RETURN p.uid AS propUid,
           coalesce(p.text, p.normalizedText, '') AS propText,
           q.uid AS questionUid,
           q.question AS question,
           coalesce(q.questionType, 'unknown') AS questionType,
           a.debateRole AS debateRole,
           a.polarity AS polarity,
           a.decisionUid AS decisionUid
    ORDER BY p.uid
    LIMIT $limit
    `,
    { onlyUid, questionUid, force, limit: neoInt(limit) }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, pending: rows.length });
  }

  let assigned = 0;
  let skipped = 0;
  let irrelevant = 0;
  let rejected = 0;
  let quarantined = 0;

  for (const row of rows) {
    if (!row.propText.trim() || !row.question.trim()) {
      skipped += 1;
      continue;
    }
    const decisionUid = `qans:${row.propUid}:${row.questionUid}`.slice(0, 180);
    let result: Awaited<ReturnType<typeof classifyAnswer>>;
    try {
      result = await classifyAnswer(
        OPENAI_API_KEY,
        MODEL,
        row.propText,
        row.question,
        row.questionType ?? "unknown"
      );
    } catch {
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
        SET a.decisionUid = $decisionUid,
            a.polarity = 'NONE',
            a.confidence = 0.0,
            a.updatedAt = datetime()
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_answer',
            dec.status = 'rejected',
            dec.actor = 'model',
            dec.confidence = 0.0,
            dec.relevant = false,
            dec.polarity = 'NONE',
            dec.rationale = 'classify_failed',
            dec.rejectedReason = 'classify_failed',
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: row.propUid,
          questionUid: row.questionUid,
          decisionUid,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      rejected += 1;
      continue;
    }

    // Noise / clear miss: auto-reject (no human queue).
    if (!result.relevant || result.confidence <= 0) {
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
        DELETE a
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_answer',
            dec.status = 'rejected',
            dec.actor = 'model',
            dec.confidence = $confidence,
            dec.relevant = $relevant,
            dec.polarity = $polarity,
            dec.rationale = $rationale,
            dec.rejectedReason = CASE WHEN $relevant THEN 'zero_confidence' ELSE 'irrelevant' END,
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: row.propUid,
          questionUid: row.questionUid,
          decisionUid,
          confidence: result.confidence,
          relevant: result.relevant,
          polarity: result.polarity,
          rationale: result.rationale,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      rejected += 1;
      irrelevant += 1;
      continue;
    }

    // Relevant but below auto-accept: keep in quarantine for rare review/retry.
    if (result.confidence < AUTO_ACCEPT) {
      await runCypher(
        `
        MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
        DELETE a
        MERGE (dec:Decision {uid: $decisionUid})
        SET dec.decisionType = 'question_answer',
            dec.status = 'quarantined',
            dec.actor = 'model',
            dec.confidence = $confidence,
            dec.relevant = true,
            dec.polarity = $polarity,
            dec.rationale = $rationale,
            dec.promptVersion = $promptVersion,
            dec.model = $model,
            dec.createdAt = coalesce(dec.createdAt, datetime()),
            dec.updatedAt = datetime()
        MERGE (dec)-[:ABOUT]->(p)
        MERGE (dec)-[:ABOUT]->(q)
        `,
        {
          propUid: row.propUid,
          questionUid: row.questionUid,
          decisionUid,
          confidence: result.confidence,
          polarity: result.polarity,
          rationale: result.rationale,
          promptVersion: PROMPT_VERSION,
          model: MODEL,
        }
      );
      quarantined += 1;
      continue;
    }

    await runCypher(
      `
      MATCH (p:Proposition {uid: $propUid})-[a:ANSWERS]->(q:Question {uid: $questionUid})
      SET a.polarity = $polarity,
          a.confidence = $confidence,
          a.debateRole = coalesce(a.debateRole, 'thesis'),
          a.decisionUid = $decisionUid,
          a.updatedAt = datetime()
      MERGE (dec:Decision {uid: $decisionUid})
      SET dec.decisionType = 'question_answer',
          dec.status = 'accepted',
          dec.actor = 'model',
          dec.confidence = $confidence,
          dec.relevant = true,
          dec.polarity = $polarity,
          dec.rationale = $rationale,
          dec.promptVersion = $promptVersion,
          dec.model = $model,
          dec.createdAt = coalesce(dec.createdAt, datetime()),
          dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(p)
      MERGE (dec)-[:ABOUT]->(q)
      `,
      {
        propUid: row.propUid,
        questionUid: row.questionUid,
        decisionUid,
        polarity: result.polarity,
        confidence: result.confidence,
        rationale: result.rationale,
        promptVersion: PROMPT_VERSION,
        model: MODEL,
      }
    );
    assigned += 1;
  }

  return json({
    ok: true,
    scanned: rows.length,
    assigned,
    skipped,
    irrelevant,
    rejected,
    quarantined,
  });
};
