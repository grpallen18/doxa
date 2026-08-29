// Supabase Edge Function: project_analysis_summaries.
// Upsert Neo Assessments into Supabase graph_assessments.
// Env: SUPABASE_*, NEO4J_*. Body: { dry_run?: boolean }

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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);

  try {
    const assessments = await runCypher<{
      uid: string;
      targetKind: string;
      targetUid: string;
      kind: string;
      summary: string;
      confidence: number;
      methodRunUid: string | null;
    }>(
      `
      MATCH (a:Assessment)
      OPTIONAL MATCH (a)-[:PRODUCED_BY]->(m:MethodRun)
      RETURN a.uid AS uid,
             coalesce(a.targetKind, 'controversy') AS targetKind,
             coalesce(a.targetUid, '') AS targetUid,
             coalesce(a.kind, 'other') AS kind,
             coalesce(a.summary, '') AS summary,
             coalesce(a.confidence, 0.0) AS confidence,
             m.uid AS methodRunUid
      `
    );

    if (dryRun) {
      return json({ ok: true, dry_run: true, assessments: assessments.length });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date().toISOString();
    const rows = assessments
      .filter((a) => a.uid && a.targetUid)
      .map((a) => ({
        uid: a.uid,
        target_kind: a.targetKind,
        target_uid: a.targetUid,
        kind: a.kind,
        summary: a.summary,
        confidence: a.confidence,
        method_run_uid: a.methodRunUid,
        layer: "analyzed",
        updated_at: now,
      }));

    if (rows.length) {
      const { error } = await supabase.from("graph_assessments").upsert(rows, {
        onConflict: "uid",
      });
      if (error) return json({ error: error.message }, 500);
    }

    return json({ ok: true, assessments: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[project_analysis_summaries]", message);
    return json({ error: message }, 500);
  }
};
