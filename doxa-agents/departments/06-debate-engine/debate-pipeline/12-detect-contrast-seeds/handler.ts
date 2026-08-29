// Supabase Edge Function: detect_contrast_seeds.
// Intra-document objection/rebuttal pairs → mint-queue clusters (no singleton Questions).
// Body: { dry_run?, limit? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, clampInt,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv, neoInt } from "../../../../lib/neo4j/session.ts";

const DEFAULT_LIMIT = 40;

type PairRow = {
  documentUid: string;
  propA: string;
  propB: string;
  textA: string;
  textB: string;
  roleA: string | null;
  roleB: string | null;
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
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
  const limit = clampInt(body.limit, 1, 100, DEFAULT_LIMIT);

  const pairs = await runCypher<PairRow>(
    `
    MATCH (a:Argument)-[r1:HAS_ROLE]->(p1:Proposition)
    MATCH (a)-[r2:HAS_ROLE]->(p2:Proposition)
    WHERE p1.uid < p2.uid
      AND (
        r1.role IN ['objection', 'rebuttal']
        OR r2.role IN ['objection', 'rebuttal']
      )
      AND NOT EXISTS { MATCH (p1)-[:ANSWERS]->(:Question) }
      AND NOT EXISTS { MATCH (p2)-[:ANSWERS]->(:Question) }
    RETURN coalesce(a.documentUid, '') AS documentUid,
           p1.uid AS propA,
           p2.uid AS propB,
           coalesce(p1.text, p1.normalizedText, '') AS textA,
           coalesce(p2.text, p2.normalizedText, '') AS textB,
           r1.role AS roleA,
           r2.role AS roleB
    LIMIT $limit
    `,
    { limit: neoInt(limit) }
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, pairs: pairs.length });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let enqueued = 0;
  for (const pair of pairs) {
    const clusterId = `contrast:${pair.propA}:${pair.propB}`;
    const { data: existing } = await supabase
      .from("l3_review_queue")
      .select("item_id")
      .eq("cluster_id", clusterId)
      .in("state", ["pending", "leased", "proposed"])
      .limit(1);
    if (existing?.length) continue;
    const { error } = await supabase.from("l3_review_queue").insert({
      kind: "mint",
      cluster_id: clusterId,
      priority: 80,
      dirty_reason: "contrast_pair",
      payload: {
        prop_uids: [pair.propA, pair.propB],
        texts: [pair.textA, pair.textB],
        document_uid: pair.documentUid,
        roles: [pair.roleA, pair.roleB],
      },
    });
    if (!error) enqueued += 1;
  }

  return json({ ok: true, pairs: pairs.length, enqueued });
};
