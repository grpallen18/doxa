// Supabase Edge Function: debate_pipeline.
// Orchestrates Neo4j debate assembly + Supabase projections (JWT off).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean }

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
} from "../../../../lib/topology/invoke-step.ts";

const STEP_NAMES = [
  "generate_proposition_pair_candidates",
  "classify_proposition_relationships",
  "build_viewpoints",
  "build_controversies",
  "detect_disputes",
  "project_debate_summaries",
] as const;

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
    } catch { /* defaults */ }

    const dryRun = Boolean(body.dry_run ?? false);
    const steps: StepResult[] = [];
    let failedStep: string | null = null;

    for (const name of STEP_NAMES) {
      const t0 = performance.now();
      const stepBody: Record<string, unknown> = { dry_run: dryRun };
      // Candidate gen may enqueue a larger backlog; classify is capped so hourly
      // cron (`limit: 50`) stays under the Edge idle timeout (~150s).
      if (name === "generate_proposition_pair_candidates") {
        if (body.limit != null) stepBody.limit = body.limit;
        if (body.min_similarity != null) stepBody.min_similarity = body.min_similarity;
      }
      if (name === "classify_proposition_relationships" && body.limit != null) {
        const n = typeof body.limit === "number" ? body.limit : Number(body.limit);
        stepBody.limit = Number.isFinite(n) ? Math.min(Math.max(1, Math.floor(n)), 25) : 25;
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
    return json({ error: toErrorString(err) || "debate_pipeline failed" }, 500);
  }
};
