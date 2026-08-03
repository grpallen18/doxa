// Supabase Edge Function: wake the Python graph-worker (POST /run).
// Env: GRAPH_WORKER_URL (required), GRAPH_WORKER_SECRET (optional Bearer).
// Body: optional { story_id?: string } for audit only.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { recordStoryStepRun, resolveStoryStepTrigger } from "../../../lib/story-step-runs.ts";

const STEP_ID = "trigger-graph-worker";
const DEPLOY_NAME = "trigger_graph_worker";

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

  const GRAPH_WORKER_URL = (Deno.env.get("GRAPH_WORKER_URL") ?? "").replace(/\/$/, "");
  const GRAPH_WORKER_SECRET = Deno.env.get("GRAPH_WORKER_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!GRAPH_WORKER_URL) {
    return json({ error: "Missing GRAPH_WORKER_URL" }, 500);
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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (GRAPH_WORKER_SECRET) headers.Authorization = `Bearer ${GRAPH_WORKER_SECRET}`;

  let wakeOk = false;
  let wakeStatus = 0;
  let wakeText = "";
  try {
    const resp = await fetch(`${GRAPH_WORKER_URL}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ story_id: storyId ?? null }),
    });
    wakeStatus = resp.status;
    wakeText = (await resp.text()).slice(0, 500);
    wakeOk = resp.ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (SUPABASE_URL && SERVICE_ROLE && storyId) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });
      await recordStoryStepRun(supabase, {
        storyId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "failure",
        trigger: resolveStoryStepTrigger(storyId),
        error: message,
      });
    }
    return json({ error: `Worker unreachable: ${message}` }, 502);
  }

  if (SUPABASE_URL && SERVICE_ROLE && storyId) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    await recordStoryStepRun(supabase, {
      storyId,
      stepId: STEP_ID,
      deployName: DEPLOY_NAME,
      outcome: wakeOk ? "success" : "failure",
      trigger: resolveStoryStepTrigger(storyId),
      error: wakeOk ? undefined : wakeText,
      meta: { wake_status: wakeStatus },
    });
  }

  if (!wakeOk) {
    return json({ error: "Worker wake failed", status: wakeStatus, body: wakeText }, 502);
  }

  return json({
    ok: true,
    woke: true,
    ...testScopeFields({ storyId }),
  });
};
