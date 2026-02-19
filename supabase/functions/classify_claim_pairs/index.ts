// Supabase Edge Function: classify_claim_pairs.
// Populates claim_relationships for eligible claims (match_claims_nearest + LLM classification).
// Batches up to 50 pairs per LLM call, max 250 pairs per run, up to 5 batches in parallel.
// Extracted from claim_cluster_nightly; used by clustering_pipeline step 1.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_claims?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIM_THRESHOLD = 0.65;
const K = 20;
const MAX_CLAIMS_PER_RUN = 25;
const PAIRS_PER_BATCH = 50;
const MAX_PAIRS_PER_RUN = 250;
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

type Relationship = "supports_same_position" | "contradicts" | "orthogonal" | "competing_framing";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function parseEmbedding(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.every((x) => typeof x === "number") ? (v as number[]) : null;
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v) as unknown;
      return Array.isArray(arr) && arr.every((x) => typeof x === "number") ? (arr as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function embeddingToStr(emb: number[]): string {
  return `[${emb.join(",")}]`;
}

async function classifyRelationshipBatch(
  apiKey: string,
  model: string,
  pairs: Array<{ textA: string; textB: string }>
): Promise<Relationship[]> {
  if (pairs.length === 0) return [];

  const blocks = pairs
    .map(
      (p, i) =>
        `Pair ${i + 1}:\nClaim A: ${p.textA}\nClaim B: ${p.textB}`
    )
    .join("\n\n");

  const system = `Classify the relationship between each pair of claims below. For each pair, return exactly one of: supports_same_position, contradicts, orthogonal, competing_framing.
- supports_same_position: Both claims assert the same or reinforcing positions.
- contradicts: One claim directly contradicts the other.
- orthogonal: Claims address different questions or are unrelated.
- competing_framing: Claims answer the same underlying question differently (competing framings, not direct contradiction).
Output only a JSON array of exactly ${pairs.length} strings in order, one per pair. No preamble.`;

  const user = `${blocks}\n\nOutput only the JSON array.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1000,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data?.choices?.[0]?.message?.content ?? "").trim();
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return pairs.map(() => "orthogonal" as Relationship);
    }
    const valid: Relationship[] = ["supports_same_position", "contradicts", "orthogonal", "competing_framing"];
    return pairs.map((_, i) => {
      const s = String(parsed[i] ?? "").toLowerCase();
      const match = s.match(/(supports_same_position|contradicts|orthogonal|competing_framing)/);
      return (match && valid.includes(match[1] as Relationship) ? match[1] : "orthogonal") as Relationship;
    });
  } catch {
    return pairs.map(() => "orthogonal" as Relationship);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

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
    /* use defaults */
  }
  const maxClaims = clampInt(body.max_claims, 1, 100, MAX_CLAIMS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: eligibleRows, error: eligErr } = await supabase
    .from("claims")
    .select("claim_id, canonical_text, embedding")
    .not("embedding", "is", null)
    .or("cluster_computed_at.is.null,needs_cluster_update.eq.true")
    .order("cluster_computed_at", { ascending: true, nullsFirst: true })
    .order("needs_cluster_update", { ascending: false })
    .limit(maxClaims);

  if (eligErr) {
    console.error("[classify_claim_pairs] Eligible claims:", eligErr.message);
    return json({ error: eligErr.message }, 500);
  }

  const eligibleClaims = (eligibleRows ?? []).filter(
    (r): r is { claim_id: string; canonical_text: string | null; embedding: unknown } =>
      typeof r === "object" && r !== null && typeof (r as { claim_id: unknown }).claim_id === "string"
  );

  if (eligibleClaims.length === 0) {
    return json({
      ok: true,
      claims_processed: 0,
      pairs_to_classify: 0,
      pairs_classified: 0,
      llm_calls: 0,
      drained: true,
      message: "No eligible claims",
      dry_run: dryRun,
    });
  }

  type PendingPair = { a: string; b: string; textA: string; textB: string; similarity: number };
  const pendingPairs: PendingPair[] = [];

  for (const claim of eligibleClaims) {
    const claimId = claim.claim_id;
    const emb = parseEmbedding(claim.embedding);
    if (!emb || emb.length === 0) continue;

    const embeddingStr = embeddingToStr(emb);
    const { data: matchRows, error: rpcErr } = await supabase.rpc("match_claims_nearest", {
      query_embedding: embeddingStr,
      match_count: K + 1,
    });

    if (rpcErr) {
      console.error("[classify_claim_pairs] match_claims_nearest:", rpcErr.message);
      continue;
    }

    const matches = (Array.isArray(matchRows) ? matchRows : []) as Array<{ claim_id: string; distance: number }>;
    const neighbors = matches
      .filter((m) => m.claim_id !== claimId)
      .map((m) => ({ claim_id: m.claim_id, similarity: 1 - m.distance }))
      .filter((m) => m.similarity >= SIM_THRESHOLD)
      .slice(0, K);

    if (neighbors.length === 0) continue;

    const textA = (claim.canonical_text ?? "").trim().slice(0, 500);

    for (const nb of neighbors) {
      const [a, b] = claimId < nb.claim_id ? [claimId, nb.claim_id] : [nb.claim_id, claimId];

      const { data: existing } = await supabase
        .from("claim_relationships")
        .select("relationship")
        .eq("claim_a_id", a)
        .eq("claim_b_id", b)
        .maybeSingle();

      if (existing) continue;

      const { data: claimBRow } = await supabase
        .from("claims")
        .select("canonical_text")
        .eq("claim_id", nb.claim_id)
        .single();

      const textB = ((claimBRow as { canonical_text?: string } | null)?.canonical_text ?? "").trim().slice(0, 500);
      pendingPairs.push({ a, b, textA, textB, similarity: nb.similarity });
    }
  }

  const toProcess = pendingPairs.slice(0, MAX_PAIRS_PER_RUN);
  const batches: Array<typeof toProcess> = [];
  for (let i = 0; i < toProcess.length; i += PAIRS_PER_BATCH) {
    batches.push(toProcess.slice(i, i + PAIRS_PER_BATCH));
  }

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      try {
        const results = await classifyRelationshipBatch(
          OPENAI_API_KEY,
          MODEL,
          batch.map((p) => ({ textA: p.textA, textB: p.textB }))
        );
        return { batch, results };
      } catch (e) {
        console.error("[classify_claim_pairs] LLM batch:", e);
        return { batch, results: batch.map(() => "orthogonal" as Relationship) };
      }
    })
  );

  if (!dryRun) {
    for (const { batch, results } of batchResults) {
      if (batch.length > 0) {
        const rows = batch.map((p, j) => ({
          claim_a_id: p.a,
          claim_b_id: p.b,
          relationship: results[j] ?? ("orthogonal" as Relationship),
          similarity_at_classification: p.similarity,
          classified_at: new Date().toISOString(),
        }));
        await supabase.from("claim_relationships").upsert(rows, { onConflict: "claim_a_id,claim_b_id" });
      }
    }
  }

  const pairsClassified = batchResults.reduce((sum, { batch }) => sum + batch.length, 0);
  const drained = pairsClassified < MAX_PAIRS_PER_RUN;
  if (drained && !dryRun) {
    await supabase
      .from("claims")
      .update({ cluster_computed_at: new Date().toISOString(), needs_cluster_update: false })
      .in("claim_id", eligibleClaims.map((c) => c.claim_id));
  }

  return json({
    ok: true,
    claims_processed: eligibleClaims.length,
    pairs_to_classify: pendingPairs.length,
    pairs_classified: pairsClassified,
    llm_calls: batchResults.length,
    drained,
    dry_run: dryRun,
  });
});
