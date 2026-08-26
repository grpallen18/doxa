// Supabase Edge Function: debate_pipeline.
// Orchestrates Neo4j Question-first debate steps (JWT off).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?, limit?, proposition_uid?, question_uid?, controversy_uid?, force?, skip_llm?, rematch_singletons?, also_rematch? }

import {
  corsHeaders,
  invokeFunction,
  json,
  toErrorString,
  type StepResult,
} from "../../../../lib/topology/invoke-step.ts";

/** Session 5 default: Question registry → qualify → viewpoints → disputes → projection. */
const STEP_NAMES = [
  "retrieve_or_mint_questions",
  "assign_question_answers",
  "qualify_controversies",
  "build_viewpoints",
  "detect_disputes",
  "project_debate_summaries",
] as const;

function resolveQuestionUid(body: Record<string, unknown>): string {
  const direct =
    typeof body.question_uid === "string" ? body.question_uid.trim() : "";
  if (direct) return direct;
  const controversy =
    typeof body.controversy_uid === "string" ? body.controversy_uid.trim() : "";
  if (controversy.startsWith("ctr_")) {
    const slug = controversy.slice(4);
    if (slug) return `cq:${slug}`;
  }
  return "";
}

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
    const resolvedQuestionUid = resolveQuestionUid(body);
    const steps: StepResult[] = [];
    let failedStep: string | null = null;

    for (const name of STEP_NAMES) {
      const t0 = performance.now();
      const stepBody: Record<string, unknown> = { dry_run: dryRun };

      if (body.limit != null) stepBody.limit = body.limit;
      if (body.force != null) stepBody.force = body.force;
      if (body.proposition_uid != null) stepBody.proposition_uid = body.proposition_uid;
      if (resolvedQuestionUid) stepBody.question_uid = resolvedQuestionUid;
      if (
        body.controversy_uid != null &&
        (name === "build_viewpoints" || name === "project_debate_summaries")
      ) {
        stepBody.controversy_uid = body.controversy_uid;
      }
      // Default retrieve is normal mint/match. Rematch is a follow-up only when also_rematch.
      if (name === "retrieve_or_mint_questions" && body.rematch_singletons === true && body.also_rematch !== true) {
        stepBody.rematch_singletons = true;
      }
      if (name === "detect_disputes" && body.skip_llm != null) {
        stepBody.skip_llm = body.skip_llm;
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

      if (
        name === "retrieve_or_mint_questions" &&
        Boolean(body.also_rematch) &&
        !dryRun
      ) {
        const t1 = performance.now();
        const rematchBody: Record<string, unknown> = {
          ...stepBody,
          rematch_singletons: true,
        };
        delete rematchBody.also_rematch;
        const rematchRes = await invokeFunction(
          SUPABASE_URL,
          SERVICE_ROLE,
          name,
          rematchBody
        );
        const rematch_ms = Math.round(performance.now() - t1);
        steps.push({
          name: "retrieve_or_mint_questions_rematch",
          status: rematchRes.ok ? "success" : "failed",
          duration_ms: rematch_ms,
          http_status: rematchRes.http_status,
          result: rematchRes.ok ? rematchRes.data : undefined,
          error: rematchRes.ok
            ? undefined
            : toErrorString(rematchRes.data?.error) || `HTTP ${rematchRes.http_status}`,
          error_detail: rematchRes.ok ? undefined : rematchRes.data,
        });
        // Rematch is best-effort: do not abort assign/qualify/project if it fails.
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
