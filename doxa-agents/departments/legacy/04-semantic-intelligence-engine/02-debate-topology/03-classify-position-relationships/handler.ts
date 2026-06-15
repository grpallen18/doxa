// Supabase Edge Function: classify_position_relationships.
// LLM classification of dequeued position pair candidates.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Body: { max_pairs?: number, dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  VALID_POSITION_KINDS,
  type PositionRelationshipKind,
} from "../../../../lib/topology/relationship-taxonomy.ts";
import { clampInt, corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_PAIRS_PER_RUN = 30;
const PAIRS_PER_BATCH = 10;

async function classifyBatch(
  apiKey: string,
  model: string,
  pairs: Array<{
    textA: string;
    textB: string;
    contextA?: { title: string; published_at: string | null };
    contextB?: { title: string; published_at: string | null };
  }>
): Promise<Array<{ relationship_kind: PositionRelationshipKind; reasoning?: string }>> {
  const system = `You classify pairs of political/policy positions that share a topic.
For each pair output exactly one relationship_kind:
- same_family: same ideological family or framing
- agree: same side on the issue
- oppose: opposite sides
- qualify: one nuance-limits the other
- broader: A is broader than B (or vice versa — pick the direction in reasoning)
- narrower: A is narrower than B
- compatible: compatible but not same side
- orthogonal: same topic, different proposition
- unrelated: not meaningfully comparable

REQUIRED: include "reasoning" (1-2 sentences) for every pair.
Output JSON array of exactly ${pairs.length} objects with "relationship_kind" and "reasoning". No markdown.`;

  const blocks = pairs
    .map(
      (p, i) =>
        `Pair ${i + 1}:\nA: ${p.textA}\nB: ${p.textB}\nContext A: ${p.contextA?.title ?? "n/a"}\nContext B: ${p.contextB?.title ?? "n/a"}`
    )
    .join("\n\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: blocks },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return pairs.map(() => ({ relationship_kind: "unrelated" as PositionRelationshipKind, reasoning: "(parse failed)" }));
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : Array.isArray((parsed as { pairs?: unknown }).pairs)
        ? (parsed as { pairs: unknown[] }).pairs
        : [];

  return pairs.map((_, i) => {
    const o = arr[i] as { relationship_kind?: string; reasoning?: string } | undefined;
    const kind = VALID_POSITION_KINDS.includes((o?.relationship_kind ?? "") as PositionRelationshipKind)
      ? (o!.relationship_kind as PositionRelationshipKind)
      : "unrelated";
    return { relationship_kind: kind, reasoning: o?.reasoning ?? "" };
  });
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    /* defaults */
  }

  const maxPairs = clampInt(body.max_pairs, 1, 50, MAX_PAIRS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: candidates, error: candErr } = await supabase.rpc("dequeue_position_pair_candidates", {
    p_limit: maxPairs,
  });

  if (candErr) return json({ error: candErr.message }, 500);

  const rows = (candidates ?? []) as Array<{ position_a_id: string; position_b_id: string }>;
  if (rows.length === 0) {
    return json({ ok: true, pairs_classified: 0, message: "No pending candidates" });
  }

  const positionIds = [...new Set(rows.flatMap((r) => [r.position_a_id, r.position_b_id]))];
  const { data: posRows } = await supabase
    .from("canonical_positions")
    .select("canonical_position_id, canonical_text")
    .in("canonical_position_id", positionIds);

  const textByPos = new Map(
    (posRows ?? []).map((p) => [
      p.canonical_position_id as string,
      ((p.canonical_text as string) ?? "").trim().slice(0, 400),
    ])
  );

  const contextByPosition = new Map<string, { title: string; published_at: string | null }>();
  const { data: spRows } = await supabase
    .from("story_positions")
    .select("canonical_position_id, stories(title, published_at, created_at)")
    .in("canonical_position_id", positionIds);

  for (const r of spRows ?? []) {
    const pid = r.canonical_position_id as string;
    if (contextByPosition.has(pid)) continue;
    const st = r.stories as { title?: string; published_at?: string | null } | null;
    contextByPosition.set(pid, {
      title: (st?.title ?? "").trim().slice(0, 80) || "(no title)",
      published_at: st?.published_at ?? null,
    });
  }

  type PairRow = { a: string; b: string; textA: string; textB: string };
  const pairs: PairRow[] = rows.map((r) => ({
    a: r.position_a_id,
    b: r.position_b_id,
    textA: textByPos.get(r.position_a_id) ?? "",
    textB: textByPos.get(r.position_b_id) ?? "",
  }));

  const batches: PairRow[][] = [];
  for (let i = 0; i < pairs.length; i += PAIRS_PER_BATCH) {
    batches.push(pairs.slice(i, i + PAIRS_PER_BATCH));
  }

  let classified = 0;
  const dryRunResults: Array<Record<string, unknown>> = [];

  for (const batch of batches) {
    let results: Array<{ relationship_kind: PositionRelationshipKind; reasoning?: string }>;
    try {
      results = await classifyBatch(
        OPENAI_API_KEY,
        MODEL,
        batch.map((p) => ({
          textA: p.textA,
          textB: p.textB,
          contextA: contextByPosition.get(p.a),
          contextB: contextByPosition.get(p.b),
        }))
      );
    } catch (e) {
      console.error("[classify_position_relationships] LLM error:", e);
      results = batch.map(() => ({ relationship_kind: "unrelated" as PositionRelationshipKind, reasoning: "(LLM error)" }));
    }

    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const r = results[j];
      if (dryRun) {
        dryRunResults.push({
          position_a_id: p.a,
          position_b_id: p.b,
          relationship_kind: r.relationship_kind,
          rationale: r.reasoning,
        });
        continue;
      }

      await supabase.from("position_relationships").upsert(
        {
          position_a_id: p.a,
          position_b_id: p.b,
          relationship_kind: r.relationship_kind,
          classified_at: new Date().toISOString(),
          confidence: 0.8,
          model: MODEL,
          rationale: r.reasoning ?? null,
        },
        { onConflict: "position_a_id,position_b_id" }
      );

      await supabase
        .from("position_pair_candidates")
        .update({ status: "classified" })
        .eq("position_a_id", p.a)
        .eq("position_b_id", p.b);

      classified += 1;
    }
  }

  return json({
    ok: true,
    pairs_dequeued: rows.length,
    pairs_classified: classified,
    dry_run: dryRun,
    classifications: dryRun ? dryRunResults : undefined,
  });
};
