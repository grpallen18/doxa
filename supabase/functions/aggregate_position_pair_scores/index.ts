// Supabase Edge Function: aggregate_position_pair_scores.
// Invokes upsert_position_pair_scores RPC to compute and upsert pair scores.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  if (dryRun) {
    const { data: positions } = await supabase
      .from("position_clusters")
      .select("position_cluster_id")
      .eq("status", "active");
    const count = (positions ?? []).length;
    return json({
      ok: true,
      pairs_found: count >= 2 ? "computed in RPC" : 0,
      message: count < 2 ? "Need at least 2 active position clusters" : undefined,
      dry_run: true,
    });
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("upsert_position_pair_scores");

  if (rpcErr) {
    console.error("[aggregate_position_pair_scores] RPC:", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  const res = rpcResult as { pairs_upserted?: number; pairs_deleted?: number } | null;
  return json({
    ok: true,
    pairs_upserted: res?.pairs_upserted ?? 0,
    pairs_deleted: res?.pairs_deleted ?? 0,
  });
});
