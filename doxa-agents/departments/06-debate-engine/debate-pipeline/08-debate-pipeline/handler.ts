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

const STEP_NAMES = [
  "bind_candidates",
  "detect_contrast_seeds",
  "enqueue_l3_reviews",
  "attach_approved_lead",
  "apply_l3_proposals",
  "qualify_controversies",
  "apply_viewpoint_proposals",
  "detect_disputes",
  "project_debate_summaries",
] as const;

/** Keep detect_contrast_seeds on disk; do not call until graph-team MINT is proven (retire last). */
const DISABLED_STEPS = new Set<string>(["detect_contrast_seeds"]);

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
    const steps: StepResult[] = [];
    let failedStep: string | null = null;
    const tAll = performance.now();

    for (const name of STEP_NAMES) {
      if (DISABLED_STEPS.has(name)) {
        steps.push({
          name,
          status: "success",
          duration_ms: 0,
          result: { skipped: true, reason: "auto_mint_disabled_until_graph_team_mint_proven" },
        });
        continue;
      }
      const t0 = performance.now();
      const stepBody: Record<string, unknown> = { dry_run: dryRun };
      if (body.limit != null) stepBody.limit = body.limit;
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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    await supabase.from("l3_runs").insert({
      bot_id: "debate_pipeline",
      kind: "pipeline",
      items: steps.length,
      ops_applied: steps.filter((s) => s.status === "success").length,
      wall_ms: Math.round(performance.now() - tAll),
      result: { steps, failed_at: failedStep, dry_run: dryRun },
    });

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
