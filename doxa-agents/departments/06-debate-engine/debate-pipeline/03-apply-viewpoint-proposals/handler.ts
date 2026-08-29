// Supabase Edge Function: apply_viewpoint_proposals.
// Applies submitted viewpoint proposals (editor output) via apply_l3_proposals path.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, invokeFunction,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";

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
    .limit(20);

  if (body.dry_run) {
    return json({ ok: true, dry_run: true, pending: rows?.length ?? 0 });
  }

  let applied = 0;
  for (const row of rows ?? []) {
    const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "apply_l3_proposals", {
      proposal_uid: row.proposal_uid,
    });
    if (res.ok) applied += 1;
  }
  return json({ ok: true, pending: rows?.length ?? 0, applied });
};
