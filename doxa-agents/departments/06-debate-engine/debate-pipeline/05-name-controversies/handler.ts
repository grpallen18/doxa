// Supabase Edge Function: name_controversies.
// LLM contested-question titles/summaries for Controversies missing a CQ.
// Decision decisionType: controversy_title. Env: NEO4J_*, OPENAI_API_KEY.
// Body: { dry_run?: boolean, limit?: number, force?: boolean }

import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LIMIT = 20;

type Named = { question: string; summary: string; confidence: number };

async function nameControversy(
  apiKey: string,
  model: string,
  sides: Array<{ label: string; thesis: string }>
): Promise<Named> {
  const system = `Write a contested-question title for a multi-sided debate.
Return ONLY JSON: {"question":"...?","summary":"...","confidence":0.0-1.0}
Rules:
- question is one specific question people actually argue (not "competing views concerning {person}").
- Do not use the entity's name as the whole topic unless the dispute is about that person as such.
- summary is 1-2 sentences naming the clash, not a news lede.
- Prefer under-claim: if sides are thin, keep the question narrow.`;
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
        { role: "user", content: JSON.stringify({ sides }) },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const question = String(parsed.question ?? "").trim();
  const summary = String(parsed.summary ?? "").trim();
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  return {
    question: question.slice(0, 240),
    summary: summary.slice(0, 600),
    confidence,
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
  const limit = clampInt(body.limit, 1, 80, DEFAULT_LIMIT);

  const rows = await runCypher<{
    uid: string;
    sides: Array<{ label: string; thesis: string }> | null;
  }>(
    `
    MATCH (c:Controversy)
    WHERE $force = true
       OR c.question IS NULL
       OR trim(c.question) = ''
       OR c.question STARTS WITH 'What are the competing views concerning'
       OR c.title STARTS WITH 'Untitled controversy'
    OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
    WITH c, collect({
      label: coalesce(v.label, ''),
      thesis: coalesce(v.summary, v.label, '')
    })[0..6] AS sides
    RETURN c.uid AS uid, sides
    ORDER BY c.updatedAt DESC
    LIMIT $limit
    `,
    { force, limit: neoInt(limit) }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, pending: rows.length });
  }

  let named = 0;
  let skipped = 0;
  for (const row of rows) {
    const sides = (row.sides ?? []).filter((s) => s.label || s.thesis);
    if (sides.length < 2) {
      skipped += 1;
      continue;
    }
    let result: Named;
    try {
      result = await nameControversy(OPENAI_API_KEY, MODEL, sides);
    } catch {
      skipped += 1;
      continue;
    }
    if (!result.question || result.confidence < 0.55) {
      skipped += 1;
      continue;
    }
    const decisionUid = `ctrtitle:${row.uid}`;
    await runCypher(
      `
      MATCH (c:Controversy {uid: $uid})
      SET c.question = $question,
          c.title = $question,
          c.summary = $summary,
          c.updatedAt = datetime()
      MERGE (dec:Decision {uid: $decisionUid})
      SET dec.decisionType = 'controversy_title',
          dec.status = 'accepted',
          dec.actor = 'model',
          dec.confidence = $confidence,
          dec.createdAt = coalesce(dec.createdAt, datetime()),
          dec.updatedAt = datetime()
      MERGE (dec)-[:ABOUT]->(c)
      `,
      {
        uid: row.uid,
        question: result.question,
        summary: result.summary,
        decisionUid,
        confidence: result.confidence,
      }
    );
    named += 1;
  }

  return json({ ok: true, named, skipped, scanned: rows.length });
};
