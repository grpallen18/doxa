// Supabase Edge Function: enqueue a Neo4j graph_processing_jobs row for one story.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { story_id: string } (required).

import { createClient } from "npm:@supabase/supabase-js@2";
import { enqueueGraphJob } from "../../../lib/graph-jobs.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { recordStoryStepRun, resolveStoryStepTrigger } from "../../../lib/story-step-runs.ts";

const STEP_ID = "enqueue-graph-job";
const DEPLOY_NAME = "enqueue_graph_job";

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

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    // defaults
  }

  const { id: storyId, invalid } = parseStoryIdFromBody(body);
  if (invalid) return json({ error: invalidUuidMessage("story_id") }, 400);
  if (!storyId) return json({ error: "story_id is required" }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: bodyRow, error: bodyErr } = await supabase
    .from("story_bodies")
    .select("story_id, content_clean")
    .eq("story_id", storyId)
    .maybeSingle();

  if (bodyErr) return json({ error: bodyErr.message }, 500);
  if (!bodyRow?.content_clean) {
    await recordStoryStepRun(supabase, {
      storyId,
      stepId: STEP_ID,
      deployName: DEPLOY_NAME,
      outcome: "no_op",
      trigger: resolveStoryStepTrigger(storyId),
      meta: { message: "No content_clean" },
    });
    return json({
      ok: false,
      error: "story has no content_clean",
      ...testScopeFields({ storyId }),
    }, 400);
  }

  const forceStale = Boolean(body.force_stale);
  const result = await enqueueGraphJob(supabase, storyId, { force_stale: forceStale });
  if (!result.ok) {
    await recordStoryStepRun(supabase, {
      storyId,
      stepId: STEP_ID,
      deployName: DEPLOY_NAME,
      outcome: "failure",
      trigger: resolveStoryStepTrigger(storyId),
      error: result.error,
    });
    return json({ error: result.error }, 500);
  }

  await recordStoryStepRun(supabase, {
    storyId,
    stepId: STEP_ID,
    deployName: DEPLOY_NAME,
    outcome: result.skipped ? "no_op" : "success",
    trigger: resolveStoryStepTrigger(storyId),
    meta: result.skipped ? { skipped: true, reason: result.reason } : { enqueued: true },
  });

  return json({
    ok: true,
    ...result,
    ...testScopeFields({ storyId }),
  });
};
