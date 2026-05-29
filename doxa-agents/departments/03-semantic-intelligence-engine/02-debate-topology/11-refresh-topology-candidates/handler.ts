// Supabase Edge Function: refresh_topology_candidates.
// Expires stale position/cluster pair candidates when claims or stories change.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { max_claims?: number, dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { clampInt, corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const SIM_THRESHOLD = 0.55;
const K = 20;
const MAX_CLAIMS_PER_RUN = 500;
const ELIGIBLE_DAYS = 14;

export const handler = async (req: Request) => {
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
    /* defaults */
  }

  const maxClaims = clampInt(body.max_claims, 1, 2000, MAX_CLAIMS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const cutoff = new Date(Date.now() - ELIGIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: claims } = await supabase
    .from("claims")
    .select("claim_id, embedding, cluster_computed_at")
    .not("embedding", "is", null)
    .or(`cluster_computed_at.is.null,cluster_computed_at.lt.${cutoff}`)
    .order("cluster_computed_at", { ascending: true, nullsFirst: true })
    .limit(maxClaims);

  let claimsChecked = 0;
  let claimsNeedingRefresh = 0;
  const affectedPositionIds = new Set<string>();

  for (const claim of claims ?? []) {
    claimsChecked += 1;
    const claimId = claim.claim_id as string;
    const emb = claim.embedding;
    const embStr = Array.isArray(emb) ? `[${(emb as number[]).join(",")}]` : typeof emb === "string" ? emb : null;
    if (!embStr) continue;

    const { data: neighbors } = await supabase.rpc("match_claims_nearest", {
      query_embedding: embStr,
      match_count: K,
    });

    const matches = (neighbors ?? []) as Array<{ claim_id: string; distance: number }>;
    const hasNewNeighbor = matches.some(
      (m) => m.claim_id !== claimId && typeof m.distance === "number" && 1 - m.distance >= SIM_THRESHOLD
    );

    if (!dryRun) {
      await supabase
        .from("claims")
        .update({
          cluster_computed_at: new Date().toISOString(),
          needs_cluster_update: hasNewNeighbor,
        })
        .eq("claim_id", claimId);
    }

    if (hasNewNeighbor) {
      claimsNeedingRefresh += 1;
      const { data: spRows } = await supabase
        .from("story_claims")
        .select("story_claim_id, story_position_claim_links(story_positions(canonical_position_id))")
        .eq("claim_id", claimId);

      for (const sc of spRows ?? []) {
        const links = sc.story_position_claim_links as Array<{
          story_positions?: { canonical_position_id?: string } | null;
        }> | null;
        for (const link of links ?? []) {
          const pid = link.story_positions?.canonical_position_id;
          if (pid) affectedPositionIds.add(pid);
        }
      }
    }
  }

  let pairCandidatesExpired = 0;
  let clusterCandidatesExpired = 0;

  if (affectedPositionIds.size > 0 && !dryRun) {
    const ids = [...affectedPositionIds];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase
        .from("position_pair_candidates")
        .update({ status: "expired" })
        .in("position_a_id", batch)
        .eq("status", "pending");
      await supabase
        .from("position_pair_candidates")
        .update({ status: "expired" })
        .in("position_b_id", batch)
        .eq("status", "pending");
    }
    pairCandidatesExpired = ids.length;

    const { data: clusterIds } = await supabase
      .from("agreement_cluster_positions")
      .select("agreement_cluster_id")
      .in("canonical_position_id", ids);

    const cids = [...new Set((clusterIds ?? []).map((r) => r.agreement_cluster_id as string))];
    if (cids.length > 0) {
      for (let i = 0; i < cids.length; i += 50) {
        const batch = cids.slice(i, i + 50);
        await supabase
          .from("agreement_cluster_pair_candidates")
          .update({ status: "expired" })
          .in("agreement_cluster_a_id", batch)
          .eq("status", "pending");
        await supabase
          .from("agreement_cluster_pair_candidates")
          .update({ status: "expired" })
          .in("agreement_cluster_b_id", batch)
          .eq("status", "pending");
      }
      clusterCandidatesExpired = cids.length;
    }
  }

  return json({
    ok: true,
    dry_run: dryRun,
    claims_checked: claimsChecked,
    claims_needing_refresh: claimsNeedingRefresh,
    affected_positions: affectedPositionIds.size,
    pair_candidates_expired: pairCandidatesExpired,
    cluster_candidates_expired: clusterCandidatesExpired,
  });
};
