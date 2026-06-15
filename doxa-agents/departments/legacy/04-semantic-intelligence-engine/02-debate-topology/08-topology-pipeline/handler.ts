// Supabase Edge Function: topology_pipeline.
// Orchestrates agreement/controversy topology build and optional summaries/viewpoints.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean, skip_summaries_viewpoints?: boolean }

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
} from "../../../../lib/topology/invoke-step.ts";

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

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
    } catch {
      /* defaults */
    }

    const dryRun = Boolean(body.dry_run ?? false);
    const skipSummariesViewpoints = Boolean(body.skip_summaries_viewpoints ?? true);

    const stepNames = [
      "build_agreement_clusters",
      "generate_agreement_cluster_candidates",
      "classify_agreement_cluster_relationships",
      "build_controversy_clusters",
    ] as const;

    const steps: StepResult[] = [];
    let failedStep: string | null = null;

    for (const name of stepNames) {
      const t0 = performance.now();
      const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, name, { dry_run: dryRun });
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

    if (!skipSummariesViewpoints) {
      for (const name of ["generate_agreement_summaries", "generate_viewpoints"] as const) {
        const t0 = performance.now();
        const res = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, name, { dry_run: dryRun });
        const duration_ms = Math.round(performance.now() - t0);
        steps.push({
          name,
          status: res.ok ? "success" : "failed",
          duration_ms,
          http_status: res.http_status,
          result: res.ok ? res.data : undefined,
          error: res.ok ? undefined : toErrorString(res.data?.error) || `HTTP ${res.http_status}`,
        });
        if (!res.ok) {
          return json({ ok: false, failed_at: name, steps }, 500);
        }
      }
    }

    const total_ms = steps.reduce((s, st) => s + st.duration_ms, 0);
    return json({
      ok: true,
      dry_run: dryRun,
      skip_summaries_viewpoints: skipSummariesViewpoints,
      summary: { total_steps: steps.length, total_duration_ms: total_ms, all_success: true },
      steps,
    });
  } catch (err) {
    return json({
      ok: false,
      error: "Unhandled error",
      error_detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
};
