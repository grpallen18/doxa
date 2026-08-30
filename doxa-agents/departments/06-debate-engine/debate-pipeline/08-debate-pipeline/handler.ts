// Supabase Edge Function: debate_pipeline.
// Registry-first L3 chain (JWT off).
// Body: { dry_run?, limit?, proposition_uid?, question_uid?, controversy_uid?, force? }

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadBootstrapState } from "../../../../lib/debate/bootstrap-config.ts";

const STEP_NAMES = [
  "bind_candidates",
  "detect_contrast_seeds",
  "apply_l3_proposals",
  "attach_approved_lead",
  "enqueue_l3_reviews",
  "qualify_controversies",
  "apply_viewpoint_proposals",
  "detect_disputes",
  "project_debate_summaries",
] as const;

function stepBodyFor(
  name: (typeof STEP_NAMES)[number],
  body: Record<string, unknown>,
  dryRun: boolean,
  resolvedQuestionUid: string
): Record<string, unknown> {
  const stepBody: Record<string, unknown> = { dry_run: dryRun };
  const pipelineLimit = body.limit != null ? Number(body.limit) : undefined;

  if (name === "bind_candidates") {
    stepBody.limit = body.bind_limit ?? pipelineLimit ?? 500;
  } else if (name === "enqueue_l3_reviews") {
    stepBody.limit = body.enqueue_limit ?? 80;
    stepBody.unbound_limit = body.unbound_limit ?? 600;
  } else if (name === "apply_l3_proposals") {
    stepBody.limit = body.apply_limit ?? Math.min(pipelineLimit ?? 50, 30);
  } else if (name === "detect_contrast_seeds") {
    stepBody.limit = body.contrast_limit ?? Math.min(pipelineLimit ?? 40, 100);
  } else if (pipelineLimit != null) {
    stepBody.limit = pipelineLimit;
  }

  if (body.force != null) stepBody.force = body.force;
  if (body.force_apply_all != null) stepBody.force_apply_all = body.force_apply_all;
  if (body.proposition_uid != null) stepBody.proposition_uid = body.proposition_uid;
  if (resolvedQuestionUid) stepBody.question_uid = resolvedQuestionUid;
  if (body.controversy_uid != null && name === "project_debate_summaries") {
    stepBody.controversy_uid = body.controversy_uid;
  }
  if (name === "detect_disputes") {
    stepBody.skip_llm = body.skip_llm != null ? Boolean(body.skip_llm) : true;
  }
  return stepBody;
}

function resolveQuestionUid(body: Record<string, unknown>): string {
  const direct = typeof body.question_uid === "string" ? body.question_uid.trim() : "";
  if (direct) return direct;
  const controversy = typeof body.controversy_uid === "string" ? body.controversy_uid.trim() : "";
  if (controversy.startsWith("ctr_")) {
    const slug = controversy.slice(4);
    if (slug) return `cq:${slug}`;
  }
  return "";
}

function shouldSkipContrastSeeds(
  body: Record<string, unknown>,
  bootstrap: boolean
): boolean {
  if (body.skip_contrast_seeds != null) return Boolean(body.skip_contrast_seeds);
  if (body.run_contrast_seeds != null) return !Boolean(body.run_contrast_seeds);
  return !bootstrap;
}

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
    const resolvedQuestionUid = resolveQuestionUid(body);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { bootstrap, questionCount } = await loadBootstrapState(supabase);
    const skipContrastSeeds = shouldSkipContrastSeeds(body, bootstrap);
    const runId = crypto.randomUUID();
    const steps: StepResult[] = [];
    let failedStep: string | null = null;
    const tAll = performance.now();

    for (const name of STEP_NAMES) {
      if (name === "detect_contrast_seeds" && skipContrastSeeds) {
        steps.push({
          name,
          status: "skipped",
          duration_ms: 0,
          result: {
            skipped: true,
            reason: "post_bootstrap_grok_mint",
            bootstrap,
            question_count: questionCount,
          },
        });
        continue;
      }

      const t0 = performance.now();
      const stepBody = stepBodyFor(name, body, dryRun, resolvedQuestionUid);

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

    const finishedSteps = steps.filter((s) => s.status === "success" || s.status === "skipped").length;
    await supabase.from("l3_runs").insert({
      run_id: runId,
      bot_id: "debate_pipeline",
      kind: "pipeline",
      items: steps.length,
      ops_applied: finishedSteps,
      wall_ms: Math.round(performance.now() - tAll),
      result: {
        steps,
        failed_at: failedStep,
        dry_run: dryRun,
        bootstrap,
        question_count: questionCount,
        skip_contrast_seeds: skipContrastSeeds,
      },
    });

    if (failedStep) {
      return json(
        {
          ok: false,
          dry_run: dryRun,
          run_id: runId,
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
      run_id: runId,
      summary: { total_steps: steps.length, total_ms },
      steps,
    });
  } catch (err) {
    return json({ error: toErrorString(err) || "debate_pipeline failed" }, 500);
  }
};
