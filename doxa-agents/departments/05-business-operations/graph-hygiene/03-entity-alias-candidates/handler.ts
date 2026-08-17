// Supabase Edge Function: entity_alias_candidates.
// Queue near-duplicate Entities (same normalizedName, different uid). No merge.
// Body: { dry_run?: boolean, limit?: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);
  const limit = clampInt(body.limit, 1, 500, 80);

  const pairs = await runCypher<{
    leftUid: string;
    rightUid: string;
    name: string;
  }>(
    `
    MATCH (a:Entity)
    WHERE coalesce(a.normalizedName, '') <> ''
    WITH a.normalizedName AS norm, coalesce(a.kindHint, '') AS kind, collect(a.uid) AS uids
    WHERE size(uids) >= 2
    UNWIND uids AS leftUid
    UNWIND uids AS rightUid
    WITH norm, leftUid, rightUid
    WHERE leftUid < rightUid
    RETURN leftUid, rightUid, norm AS name
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, candidate_count: pairs.length, sample: pairs.slice(0, 10) });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  if (pairs.length) {
    const { error } = await supabase.from("graph_entity_alias_candidates").upsert(
      pairs.map((p) => ({
        left_uid: p.leftUid,
        right_uid: p.rightUid,
        score: 1,
        status: "pending",
      })),
      { onConflict: "left_uid,right_uid" }
    );
    if (error) return json({ error: error.message }, 500);
  }

  return json({ ok: true, candidate_count: pairs.length });
};
