// Supabase Edge Function: aggregate_position_pair_scores.
// Populates position_pair_scores from claim_relationships + position_cluster_claims.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DB_SUPPORTING,
  DB_CONTRADICTORY,
  DB_COMPETING_FRAMING,
} from "../_shared/relationship_map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALPHA = 0.8; // weight for competing_framing in controversy_score

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: positions } = await supabase.from("position_clusters").select("position_cluster_id");
  const positionIds = (positions ?? []).map((r) => (r as { position_cluster_id: string }).position_cluster_id);
  if (positionIds.length < 2) {
    return json({ ok: true, pairs_upserted: 0, message: "Need at least 2 position clusters" });
  }

  const { data: members } = await supabase.from("position_cluster_claims").select("position_cluster_id, claim_id");
  const claimToPosition = new Map<string, string>();
  for (const r of members ?? []) {
    const pid = (r as { position_cluster_id: string }).position_cluster_id;
    const cid = (r as { claim_id: string }).claim_id;
    claimToPosition.set(cid, pid);
  }

  const { data: relRows } = await supabase
    .from("claim_relationships")
    .select("claim_a_id, claim_b_id, relationship")
    .in("relationship", [DB_SUPPORTING, DB_CONTRADICTORY, DB_COMPETING_FRAMING]);

  type PairKey = string;
  const pairScores = new Map<
    PairKey,
    { contradictory: number; competing: number; supporting: number }
  >();

  for (const r of relRows ?? []) {
    const a = (r as { claim_a_id: string }).claim_a_id;
    const b = (r as { claim_b_id: string }).claim_b_id;
    const rel = (r as { relationship: string }).relationship;
    const pa = claimToPosition.get(a);
    const pb = claimToPosition.get(b);
    if (!pa || !pb || pa === pb) continue;
    const [p1, p2] = pa < pb ? [pa, pb] : [pb, pa];
    const key = `${p1}:${p2}`;
    if (!pairScores.has(key)) pairScores.set(key, { contradictory: 0, competing: 0, supporting: 0 });
    const s = pairScores.get(key)!;
    if (rel === DB_CONTRADICTORY) s.contradictory++;
    else if (rel === DB_COMPETING_FRAMING) s.competing++;
    else if (rel === DB_SUPPORTING) s.supporting++;
  }

  if (dryRun) {
    return json({ ok: true, pairs_found: pairScores.size, dry_run: true });
  }

  // Clear existing (full refresh)
  const { data: existing } = await supabase.from("position_pair_scores").select("position_a_id");
  const aIds = [...new Set((existing ?? []).map((r) => (r as { position_a_id: string }).position_a_id))];
  if (aIds.length > 0) {
    await supabase.from("position_pair_scores").delete().in("position_a_id", aIds);
  }

  const now = new Date().toISOString();
  const rows: Array<{
    position_a_id: string;
    position_b_id: string;
    contradictory_count: number;
    competing_framing_count: number;
    supporting_count: number;
    controversy_score: number;
    last_aggregated_at: string;
  }> = [];
  for (const [key, s] of pairScores) {
    const [pa, pb] = key.split(":");
    const score = s.contradictory + ALPHA * s.competing;
    rows.push({
      position_a_id: pa,
      position_b_id: pb,
      contradictory_count: s.contradictory,
      competing_framing_count: s.competing,
      supporting_count: s.supporting,
      controversy_score: score,
      last_aggregated_at: now,
    });
  }

  if (rows.length > 0) {
    await supabase.from("position_pair_scores").insert(rows);
  }

  return json({ ok: true, pairs_upserted: rows.length });
});
