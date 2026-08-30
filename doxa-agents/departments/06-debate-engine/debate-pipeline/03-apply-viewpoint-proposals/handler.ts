// Supabase Edge Function: apply_viewpoint_proposals.
// Applies submitted viewpoint proposals (editor output) via apply_l3_proposals path.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, invokeFunction,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { getNeo4jEnv, runCypher } from "../../../../lib/neo4j/session.ts";

async function repairViewpointIncludes(): Promise<number> {
  if (!getNeo4jEnv()) return 0;
  const rows = await runCypher<{ linked: number }>(
    `
    MATCH (c:Controversy)-[:ABOUT]->(q:Question)
    MATCH (v:Viewpoint {questionUid: q.uid})
    WHERE NOT (c)-[:INCLUDES]->(v)
    MERGE (c)-[:INCLUDES]->(v)
    RETURN count(v) AS linked
    `
  );
  return Number(rows[0]?.linked ?? 0);
}

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

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: rows } = await supabase
    .from("l3_proposals")
    .select("proposal_uid")
    .eq("kind", "viewpoint")
    .in("status", ["submitted", "validated"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (body.dry_run) {
    return json({ ok: true, dry_run: true, pending: rows?.length ?? 0 });
  }

  let applied = 0;
  let rejected = 0;
  let unchanged = 0;
  const errors: Array<{ proposal_uid: string; status?: string; detail?: string }> = [];

  for (const row of rows ?? []) {
    const proposalUid = row.proposal_uid as string;
    const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "apply_l3_proposals", {
      proposal_uid: proposalUid,
    });
    if (!res.ok) {
      errors.push({
        proposal_uid: proposalUid,
        detail: String(res.data?.error ?? `HTTP ${res.http_status}`),
      });
      continue;
    }

    const { data: after } = await supabase
      .from("l3_proposals")
      .select("status, validator_errors")
      .eq("proposal_uid", proposalUid)
      .maybeSingle();

    const status = after?.status ?? "";
    if (status === "applied") {
      applied += 1;
    } else if (status === "rejected") {
      rejected += 1;
      errors.push({
        proposal_uid: proposalUid,
        status,
        detail: JSON.stringify(after?.validator_errors ?? {}),
      });
    } else {
      unchanged += 1;
      errors.push({
        proposal_uid: proposalUid,
        status: status || "unknown",
        detail: "proposal status unchanged after apply",
      });
    }
  }

  return json({
    ok: true,
    pending: rows?.length ?? 0,
    applied,
    rejected,
    unchanged,
    repaired_includes: await repairViewpointIncludes(),
    errors,
  });
};
