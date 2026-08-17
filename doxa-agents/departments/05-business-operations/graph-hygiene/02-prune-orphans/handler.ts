// Supabase Edge Function: prune_orphans.
// Deletes orphan Assessments/Decisions and stale projection rows.
// Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);

  const orphanAssess = await runCypher<{ uid: string }>(
    `
    MATCH (a:Assessment)
    WHERE a.targetKind = 'controversy'
      AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
    RETURN a.uid AS uid
    `
  );
  const orphanDec = await runCypher<{ uid: string }>(
    `
    MATCH (d:Decision)
    WHERE d.decisionType STARTS WITH 'assess'
      AND NOT EXISTS { MATCH (d)-[:ABOUT]->() }
    RETURN d.uid AS uid
    `
  );
  const emptyIssues = await runCypher<{ uid: string }>(
    `
    MATCH (i:Issue)
    WHERE NOT EXISTS { MATCH (i)<-[:IN_ISSUE]-() }
    RETURN i.uid AS uid
    `
  );

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      orphan_assessments: orphanAssess.length,
      orphan_decisions: orphanDec.length,
      empty_issues: emptyIssues.length,
    });
  }

  await runCypher(
    `
    MATCH (a:Assessment)
    WHERE a.targetKind = 'controversy'
      AND NOT EXISTS { MATCH (a)-[:ABOUT]->(:Controversy) }
    DETACH DELETE a
    `
  );
  await runCypher(
    `
    MATCH (d:Decision)
    WHERE d.decisionType STARTS WITH 'assess'
      AND NOT EXISTS { MATCH (d)-[:ABOUT]->() }
    DETACH DELETE d
    `
  );
  await runCypher(
    `
    MATCH (i:Issue)
    WHERE NOT EXISTS { MATCH (i)<-[:IN_ISSUE]-() }
      AND NOT EXISTS { MATCH (c:Controversy {issueUid: i.uid}) }
    DETACH DELETE i
    `
  );

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let sqlDeleted = 0;
  if (SUPABASE_URL && SERVICE_ROLE) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: ctr } = await supabase.from("graph_controversies").select("uid");
    const keep = new Set((ctr ?? []).map((r) => r.uid as string));
    const { data: assess } = await supabase
      .from("graph_assessments")
      .select("uid, target_uid, target_kind")
      .eq("target_kind", "controversy");
    const stale = (assess ?? []).filter((r) => !keep.has(r.target_uid as string));
    if (stale.length) {
      const { error } = await supabase
        .from("graph_assessments")
        .delete()
        .in("uid", stale.map((r) => r.uid as string));
      if (!error) sqlDeleted = stale.length;
    }
  }

  return json({
    ok: true,
    orphan_assessments: orphanAssess.length,
    orphan_decisions: orphanDec.length,
    empty_issues: emptyIssues.length,
    sql_assessments_deleted: sqlDeleted,
  });
};
