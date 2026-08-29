// Supabase Edge Function: graph_hygiene.
// Orchestrates integrity audit, prune, alias queue, projection reconcile (JWT off).

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";

const STEP_NAMES = [
  "graph_integrity_audit",
  "prune_orphans",
  "entity_alias_candidates",
  "projection_reconcile",
] as const;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }
  const dryRun = Boolean(body.dry_run ?? false);

  const steps: StepResult[] = [];
  for (const name of STEP_NAMES) {
    const t0 = performance.now();
    const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, name, { dry_run: dryRun });
    steps.push({
      name,
      status: res.ok ? "success" : "failed",
      duration_ms: Math.round(performance.now() - t0),
      http_status: res.http_status,
      result: res.ok ? res.data : undefined,
      error: res.ok ? undefined : toErrorString(res.data?.error) || `HTTP ${res.http_status}`,
      error_detail: res.ok ? undefined : res.data,
    });
    if (!res.ok) {
      return json({ ok: false, dry_run: dryRun, failed_at: name, steps }, 500);
    }
  }
  return json({ ok: true, dry_run: dryRun, steps });
};
