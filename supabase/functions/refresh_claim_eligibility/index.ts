// Supabase Edge Function: refresh_claim_eligibility.
// Reevaluates claims with cluster_computed_at older than 14 days via vector search (no LLM).
// Resets 14-day timer if no new pairs; flags needs_cluster_update if new pairs found.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_claims?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIM_THRESHOLD = 0.65;
const K = 20;
const MAX_CLAIMS_PER_RUN = 500;
const ELIGIBLE_DAYS = 14;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
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
  const maxClaims = clampInt(body.max_claims, 1, 1000, MAX_CLAIMS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ELIGIBLE_DAYS);
  const cutoffStr = cutoff.toISOString();

  const { data: eligibleRows, error: eligErr } = await supabase
    .from("claims")
    .select("claim_id, embedding")
    .not("embedding", "is", null)
    .not("cluster_computed_at", "is", null)
    .lt("cluster_computed_at", cutoffStr)
    .order("cluster_computed_at", { ascending: true })
    .limit(maxClaims);

  if (eligErr) {
    console.error("[refresh_claim_eligibility] Eligible claims:", eligErr.message);
    return json({ error: eligErr.message }, 500);
  }

  const eligibleClaims = (eligibleRows ?? []).filter(
    (r): r is { claim_id: string; embedding: unknown } =>
      typeof r === "object" && r !== null && typeof (r as { claim_id: unknown }).claim_id === "string"
  );

  if (eligibleClaims.length === 0) {
    return json({ ok: true, refreshed: 0, flagged: 0, message: "No eligible claims", dry_run: dryRun });
  }

  const toRefresh: string[] = [];
  const toFlag: string[] = [];

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
      console.error("[refresh_claim_eligibility] match_claims_nearest:", rpcErr.message);
      continue;
    }

    const matches = (Array.isArray(matchRows) ? matchRows : []) as Array<{ claim_id: string; distance: number }>;
    const neighbors = matches
      .filter((m) => m.claim_id !== claimId)
      .map((m) => ({ claim_id: m.claim_id, similarity: 1 - m.distance }))
      .filter((m) => m.similarity >= SIM_THRESHOLD)
      .slice(0, K);

    if (neighbors.length === 0) {
      toRefresh.push(claimId);
      continue;
    }

    let hasNewPair = false;
    for (const nb of neighbors) {
      const [a, b] = claimId < nb.claim_id ? [claimId, nb.claim_id] : [nb.claim_id, claimId];
      const { data: existing } = await supabase
        .from("claim_relationships")
        .select("relationship")
        .eq("claim_a_id", a)
        .eq("claim_b_id", b)
        .maybeSingle();
      if (!existing) {
        hasNewPair = true;
        break;
      }
    }

    if (hasNewPair) {
      toFlag.push(claimId);
    } else {
      toRefresh.push(claimId);
    }
  }

  if (!dryRun) {
    if (toRefresh.length > 0) {
      const now = new Date().toISOString();
      await supabase
        .from("claims")
        .update({ cluster_computed_at: now })
        .in("claim_id", toRefresh);
    }
    if (toFlag.length > 0) {
      await supabase
        .from("claims")
        .update({ needs_cluster_update: true })
        .in("claim_id", toFlag);
    }
  }

  return json({
    ok: true,
    refreshed: toRefresh.length,
    flagged: toFlag.length,
    dry_run: dryRun,
  });
});
