// Supabase Edge Function: projection_reconcile.
// Align graph_controversies / subjects with Neo Controversy set.
// Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

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

  const neo = await runCypher<{ uid: string }>(
    `MATCH (c:Controversy {status: 'established'}) RETURN c.uid AS uid`
  );
  const neoUids = new Set(neo.map((r) => r.uid));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: rows } = await supabase.from("graph_controversies").select("uid");
  const stale = (rows ?? []).map((r) => r.uid as string).filter((uid) => !neoUids.has(uid));
  const { data: sqlUids } = await supabase.from("graph_controversies").select("uid");
  const missing = [...neoUids].filter(
    (uid) => !(sqlUids ?? []).some((r) => r.uid === uid)
  );

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      neo: neoUids.size,
      stale: stale.length,
      missing_in_sql: missing.length,
    });
  }

  if (stale.length) {
    await supabase.from("graph_controversy_subjects").delete().in("controversy_uid", stale);
    await supabase.from("graph_topic_links").delete().in("controversy_uid", stale);
    await supabase.from("graph_viewpoints").delete().in("controversy_uid", stale);
    await supabase.from("graph_controversy_evidence").delete().in("controversy_uid", stale);
    await supabase.from("graph_evidence_excerpts").delete().in("controversy_uid", stale);
    await supabase.from("graph_controversies").delete().in("uid", stale);
  }

  const { data: qRows } = await supabase.from("graph_questions").select("uid");
  const neoQ = await runCypher<{ uid: string }>(`MATCH (q:Question) RETURN q.uid AS uid`);
  const neoQSet = new Set(neoQ.map((r) => r.uid));
  const staleQ = (qRows ?? []).map((r) => r.uid as string).filter((uid) => !neoQSet.has(uid));
  if (staleQ.length) {
    await supabase.from("graph_questions").delete().in("uid", staleQ);
  }

  return json({
    ok: true,
    neo: neoUids.size,
    stale_deleted: stale.length,
    questions_stale_deleted: staleQ.length,
    missing_in_sql: missing.length,
    hint: missing.length ? "Run project_debate_summaries" : undefined,
  });
};
