// Supabase Edge Function: analysis_pipeline.
// Orchestrates Phase 3 L4 analytical jobs (JWT off).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean, limit?: number }

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";

const STEP_NAMES = [
  "generate_evidence_check_candidates",
  "run_evidence_checks",
  "extract_citations",
  "run_controversy_assessments",
  "update_held_by_tracks",
  "link_derived_media_clips",
  "project_analysis_summaries",
  "project_person_profiles",
] as const;

const LIMIT_STEPS = new Set([
  "generate_evidence_check_candidates",
  "run_evidence_checks",
  "extract_citations",
  "run_controversy_assessments",
  "update_held_by_tracks",
  "link_derived_media_clips",
  "project_person_profiles",
]);

/** Cap heavy Neo batch steps so a large orchestrator `limit` cannot blow Edge idle timeout. */
const LLM_LIMIT_STEPS = new Set([
  "run_evidence_checks",
  "run_controversy_assessments",
]);
const LLM_LIMIT_CAP = 25;
const PERSON_PROFILE_LIMIT_CAP = 40;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;

  try {
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
    } catch { /* defaults */ }

    const dryRun = Boolean(body.dry_run ?? false);
    const steps: StepResult[] = [];
    let failedStep: string | null = null;

    for (const name of STEP_NAMES) {
      const t0 = performance.now();
      const stepBody: Record<string, unknown> = { dry_run: dryRun };
      if (LIMIT_STEPS.has(name) && body.limit != null) {
        const n = typeof body.limit === "number" ? body.limit : Number(body.limit);
        const base = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
        if (LLM_LIMIT_STEPS.has(name)) {
          stepBody.limit = Math.min(base, LLM_LIMIT_CAP);
        } else if (name === "project_person_profiles") {
          stepBody.limit = Math.min(base, PERSON_PROFILE_LIMIT_CAP);
        } else {
          stepBody.limit = base;
        }
      }
      const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, name, stepBody);
      const duration_ms = Math.round(performance.now() - t0);
      steps.push({
        name,
        status: res.ok ? "success" : "failed",
        duration_ms,
        http_status: res.http_status,
        result: res.ok ? res.data : undefined,
        error: res.ok ? undefined : toErrorString(res.data?.error) || `HTTP ${res.http_status}`,
        error_detail: res.ok ? undefined : res.data,
      });
      if (!res.ok) {
        failedStep = name;
        break;
      }
    }

    if (failedStep) {
      return json(
        {
          ok: false,
          dry_run: dryRun,
          failed_at: failedStep,
          summary: { total_steps: steps.length, failed_step: failedStep },
          steps,
        },
        500
      );
    }

    const total_ms = steps.reduce((s, st) => s + st.duration_ms, 0);
    return json({
      ok: true,
      dry_run: dryRun,
      summary: { total_steps: steps.length, total_ms },
      steps,
    });
  } catch (err) {
    return json({ error: toErrorString(err) || "analysis_pipeline failed" }, 500);
  }
};
