// Supabase Edge Function: clustering_pipeline.
// Orchestrates position-first clustering: link_canonical_positions -> assign_ranked_subtopics -> classify_position_pairs -> build_debate_topology -> generate_agreement_summaries -> generate_viewpoints.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, skip_summaries_viewpoints?: boolean }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

type StepResult = {
  name: string;
  status: "success" | "failed";
  duration_ms: number;
  http_status?: number;
  result?: Record<string, unknown>;
  error?: string;
  error_detail?: unknown;
};

async function invokeFunction(
  baseUrl: string,
  serviceRole: string,
  name: string,
  body: Record<string, unknown> = {}
): Promise<{ ok: boolean; http_status: number; data: Record<string, unknown> }> {
  const url = `${baseUrl}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { error: "Invalid JSON response", raw: rawText.slice(0, 500) };
  }
  const data: Record<string, unknown> =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    ok: res.ok,
    http_status: res.status,
    data,
  };
}

function toErrorString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "message" in v && typeof (v as { message?: unknown }).message === "string") {
    return (v as { message: string }).message;
  }
  return String(v);
}

Deno.serve(async (req: Request) => {
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
    /* use defaults */
  }
  const dryRun = Boolean(body.dry_run ?? false);
  const skipSummariesViewpoints = Boolean(body.skip_summaries_viewpoints ?? true);

  const steps: StepResult[] = [];
  let failedStep: string | null = null;

  function addStep(name: string, start: number, res: { ok: boolean; http_status: number; data: Record<string, unknown> }): void {
    const duration_ms = Math.round(performance.now() - start);
    const status = res.ok ? "success" : "failed";
    steps.push({
      name,
      status,
      duration_ms,
      http_status: res.http_status,
      result: res.ok ? res.data : undefined,
      error: res.ok ? undefined : toErrorString(res.data?.error) || `HTTP ${res.http_status}`,
      error_detail: res.ok ? undefined : res.data,
    });
    if (!res.ok) failedStep = failedStep ?? name;
  }

  // 1. link_canonical_positions
  const t1 = performance.now();
  const r1 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "link_canonical_positions", { dry_run: dryRun });
  addStep("link_canonical_positions", t1, r1);
  if (!r1.ok) {
    return json({
      ok: false,
      dry_run: dryRun,
      failed_at: "link_canonical_positions",
      error: toErrorString(r1.data?.error) || `HTTP ${r1.http_status}`,
      summary: { total_steps: steps.length, failed_step: failedStep },
      steps,
    }, 500);
  }

  // 2. assign_ranked_subtopics
  const t2 = performance.now();
  const r2 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "assign_ranked_subtopics", { dry_run: dryRun });
  addStep("assign_ranked_subtopics", t2, r2);
  if (!r2.ok) {
    return json({
      ok: false,
      dry_run: dryRun,
      failed_at: "assign_ranked_subtopics",
      error: toErrorString(r2.data?.error) || `HTTP ${r2.http_status}`,
      summary: { total_steps: steps.length, failed_step: failedStep },
      steps,
    }, 500);
  }

  // 3. classify_position_pairs
  const t3 = performance.now();
  const r3 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "classify_position_pairs", { dry_run: dryRun });
  addStep("classify_position_pairs", t3, r3);
  if (!r3.ok) {
    return json({
      ok: false,
      dry_run: dryRun,
      failed_at: "classify_position_pairs",
      error: toErrorString(r3.data?.error) || `HTTP ${r3.http_status}`,
      summary: { total_steps: steps.length, failed_step: failedStep },
      steps,
    }, 500);
  }

  // 4. build_debate_topology
  const t4 = performance.now();
  const r4 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "build_debate_topology", { dry_run: dryRun });
  addStep("build_debate_topology", t4, r4);
  if (!r4.ok) {
    return json({
      ok: false,
      dry_run: dryRun,
      failed_at: "build_debate_topology",
      error: toErrorString(r4.data?.error) || `HTTP ${r4.http_status}`,
      summary: { total_steps: steps.length, failed_step: failedStep },
      steps,
    }, 500);
  }

  // 5. generate_agreement_summaries (skipped when skip_summaries_viewpoints)
  if (!skipSummariesViewpoints) {
    const t5 = performance.now();
    const r5 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "generate_agreement_summaries", {
      dry_run: dryRun,
    });
    addStep("generate_agreement_summaries", t5, r5);
    if (!r5.ok) {
      return json({
        ok: false,
        dry_run: dryRun,
        skip_summaries_viewpoints: skipSummariesViewpoints,
        failed_at: "generate_agreement_summaries",
        error: toErrorString(r5.data?.error) || `HTTP ${r5.http_status}`,
        summary: { total_steps: steps.length, failed_step: failedStep },
        steps,
      }, 500);
    }

    // 6. generate_viewpoints
    const t6 = performance.now();
    const r6 = await invokeFunction(SUPABASE_URL, SERVICE_ROLE, "generate_viewpoints", { dry_run: dryRun });
    addStep("generate_viewpoints", t6, r6);
    if (!r6.ok) {
      return json({
        ok: false,
        dry_run: dryRun,
        skip_summaries_viewpoints: skipSummariesViewpoints,
        failed_at: "generate_viewpoints",
        error: toErrorString(r6.data?.error) || `HTTP ${r6.http_status}`,
        summary: { total_steps: steps.length, failed_step: failedStep },
        steps,
      }, 500);
    }
  }

  const total_ms = steps.reduce((s, st) => s + st.duration_ms, 0);
  const summary: Record<string, unknown> = {
    total_steps: steps.length,
    total_duration_ms: total_ms,
    all_success: true,
    skip_summaries_viewpoints: skipSummariesViewpoints,
  };
  for (const st of steps) {
    if (st.result && typeof st.result === "object") {
      summary[st.name] = st.result;
    }
  }

  return json({
    ok: true,
    dry_run: dryRun,
    skip_summaries_viewpoints: skipSummariesViewpoints,
    summary,
    steps,
  });
  } catch (err) {
    return json({
      ok: false,
      error: "Unhandled error",
      error_detail: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});
