// Supabase Edge Function: seed_question_registry.
// Upserts :Question nodes from a JSON batch (gold seed).
// Body: { questions: [{ question, questionType?, exclusivity? }], dry_run? }
// Env: NEO4J_*, OPENAI_API_KEY
// JWT-off.

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";
import {
  EMBEDDING_MODEL,
  QUESTION_SCHEMA_VERSION,
  embedTexts,
  ensureQuestionMark,
  normalizeQuestionText,
  parseExclusivity,
  parseQuestionType,
  questionUidFromText,
} from "../../../../lib/debate/question-identity.ts";

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const dryRun = Boolean(body.dry_run ?? false);
  const rawQs = Array.isArray(body.questions) ? body.questions : [];
  if (!rawQs.length || rawQs.length > 200) {
    return json({ error: "questions required (1–200)" }, 400);
  }

  // Ensure constraints exist (idempotent).
  try {
    await runCypher(`
      CREATE CONSTRAINT question_uid IF NOT EXISTS
      FOR (q:Question) REQUIRE q.uid IS UNIQUE
    `);
  } catch { /* may lack CREATE privilege on some plans; MERGE still works if applied once */ }
  try {
    await runCypher(`CREATE INDEX question_status IF NOT EXISTS FOR (q:Question) ON (q.status)`);
    await runCypher(`CREATE INDEX question_type IF NOT EXISTS FOR (q:Question) ON (q.questionType)`);
  } catch { /* ignore */ }

  type Item = { question: string; questionType: string; exclusivity: string; uid: string };
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const raw of rawQs) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const q = ensureQuestionMark(String(row.question ?? "").trim());
    if (!q || q.toLowerCase() === "none") continue;
    const norm = normalizeQuestionText(q);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const uid = await questionUidFromText(q);
    items.push({
      uid,
      question: q,
      questionType: parseQuestionType(row.questionType ?? row.question_type) ?? "",
      exclusivity: parseExclusivity(row.exclusivity ?? row.answerExclusivity) ?? "",
    });
  }

  if (dryRun) {
    return json({ ok: true, dry_run: true, count: items.length, sample: items.slice(0, 5) });
  }

  const embeddings = await embedTexts(
    apiKey,
    items.map((i) => i.question),
    EMBEDDING_MODEL
  );

  let upserted = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const embedding = embeddings[i];
    if (!embedding?.length) continue;
    await runCypher(
      `
      MERGE (q:Question {uid: $uid})
      ON CREATE SET
        q.createdAt = datetime(),
        q.status = 'developing',
        q.confidence = 1.0
      SET q.question = $question,
          q.questionType = CASE WHEN $questionType <> '' THEN $questionType
                               ELSE coalesce(q.questionType, 'unknown') END,
          q.answerExclusivity = CASE WHEN $exclusivity <> '' THEN $exclusivity
                                    ELSE coalesce(q.answerExclusivity, 'unknown') END,
          q.embedding = $embedding,
          q.schemaVersion = $schemaVersion,
          q.seededFromGold = true,
          q.updatedAt = datetime()
      `,
      {
        uid: item.uid,
        question: item.question,
        questionType: item.questionType,
        exclusivity: item.exclusivity,
        embedding,
        schemaVersion: QUESTION_SCHEMA_VERSION,
      }
    );
    upserted += 1;
  }

  return json({ ok: true, upserted, total: items.length });
};
