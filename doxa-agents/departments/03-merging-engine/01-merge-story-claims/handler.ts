// Merge chunk claims into story_claims (claims-only pipeline).

import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeChunkBlob, provenanceMetadata } from "../../../lib/extraction-qa/atom-schema.ts";
import {
  callOpenAIJson,
  MERGE_CLAIMS_SYSTEM_PROMPT,
} from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  recordStoryStepRun,
  recordStoryStepRunsForBatch,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "merge-story-claims";
const DEPLOY_NAME = "merge_story_claims";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_STORIES = 1;

const MERGE_CLAIMS_JSON_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          polarity: { type: "string", enum: ["asserts", "denies", "uncertain"] },
          stance: { type: "string", enum: ["support", "oppose", "neutral"] },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["raw_text", "polarity", "stance", "extraction_confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

type MergeClaim = {
  raw_text: string;
  polarity: string;
  stance?: string;
  extraction_confidence: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function clampNum(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

async function callMergeClaimsLLM(
  apiKey: string,
  model: string,
  metadata: Awaited<ReturnType<typeof loadStoryMetadata>>,
  chunkBlobs: unknown[],
  requestId: string
): Promise<{ claims: MergeClaim[] }> {
  const parsed = await callOpenAIJson<{ claims?: MergeClaim[] }>(
    apiKey,
    model,
    MERGE_CLAIMS_SYSTEM_PROMPT,
    { ...metadataPayload(metadata), chunk_blobs: chunkBlobs },
    "doxa_merge_story_claims",
    MERGE_CLAIMS_JSON_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
  return { claims: Array.isArray(parsed?.claims) ? parsed.claims : [] };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
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
  const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
  if (invalidStoryId) return json({ error: invalidUuidMessage("story_id") }, 400);

  const maxStories = clampInt(body.max_stories, 1, 5, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let toProcess: string[] = [];

  if (singleStoryId) {
    const { data: storyRow, error: storyErr } = await supabase
      .from("stories")
      .select("story_id")
      .eq("story_id", singleStoryId)
      .maybeSingle();
    if (storyErr) return json({ error: storyErr.message }, 500);
    if (!storyRow) return json({ error: "Story not found", story_id: singleStoryId }, 404);

    const { data: readyRaw, error: readyErr } = await supabase.rpc("get_stories_ready_to_merge", {
      p_limit: 100,
    });
    if (readyErr) return json({ error: readyErr.message }, 500);
    const readyIds = new Set(
      (Array.isArray(readyRaw) ? readyRaw : [])
        .map((r: { story_id?: string }) => r?.story_id)
        .filter((id): id is string => typeof id === "string")
    );
    if (!readyIds.has(singleStoryId)) {
      if (!dryRun) {
        await recordStoryStepRun(supabase, {
          storyId: singleStoryId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "no_op",
          trigger: resolveStoryStepTrigger(singleStoryId),
          meta: { message: "Story not ready to merge" },
        });
      }
      return json(
        {
          error:
            "Story is not ready to merge — all chunks must be extracted, chunk QA passed, and no story claims yet.",
          story_id: singleStoryId,
        },
        409
      );
    }

    toProcess = [singleStoryId];
  } else {
    const { data: readyRaw, error: rpcErr } = await supabase.rpc("get_stories_ready_to_merge", {
      p_limit: maxStories,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    toProcess = (Array.isArray(readyRaw) ? readyRaw : [])
      .map((r: { story_id?: string }) => r?.story_id)
      .filter((id): id is string => typeof id === "string");
  }

  if (toProcess.length === 0) {
    if (!dryRun && singleStoryId) {
      await recordStoryStepRun(supabase, {
        storyId: singleStoryId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "no_op",
        trigger: resolveStoryStepTrigger(singleStoryId),
        meta: { message: "No stories ready to merge" },
      });
    }
    return json({
      ok: true,
      processed: 0,
      story_claims: 0,
      message: "No stories ready to merge",
      dry_run: dryRun,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  const requestId = `merge-claims-${Date.now()}`;
  let runId: string | null = null;

  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "merge_story_claims",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    } catch {
      /* continue */
    }
  }

  let processed = 0;
  let totalClaims = 0;

  for (const storyId of toProcess) {
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select("extraction_json")
      .eq("story_id", storyId)
      .order("chunk_index", { ascending: true });

    const blobs = (chunks ?? [])
      .map((c: { extraction_json: unknown }) => c.extraction_json)
      .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object" && !Array.isArray(b))
      .map(normalizeChunkBlob);

    if (blobs.length === 0) continue;

    let mergeClaims: MergeClaim[] = [];
    try {
      const storyMetadata = await loadStoryMetadata(supabase, storyId);
      const mergeResult = await callMergeClaimsLLM(
        OPENAI_API_KEY,
        MODEL,
        storyMetadata,
        blobs,
        `${requestId}-${storyId}`
      );
      mergeClaims = mergeResult.claims;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!dryRun) {
        await recordStoryStepRun(supabase, {
          storyId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "failure",
          trigger: resolveStoryStepTrigger(singleStoryId),
          pipelineRunId: runId,
          error: msg,
        });
        if (runId) {
          await supabase
            .from("pipeline_runs")
            .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
            .eq("run_id", runId);
        }
      }
      return json({ error: msg, story_id: storyId }, 500);
    }

    if (dryRun) {
      totalClaims += mergeClaims.length;
      processed += 1;
      continue;
    }

    const claimIds: string[] = [];
    for (const c of mergeClaims) {
      const conf = clampNum(c.extraction_confidence, 0, 1, 0.5);
      const stanceVal =
        c.stance && ["support", "oppose", "neutral"].includes(c.stance) ? c.stance : null;
      const claimProv = provenanceMetadata(c as Record<string, unknown>);
      const { data: ins } = await supabase
        .from("story_claims")
        .insert({
          story_id: storyId,
          raw_text: (c.raw_text ?? "").trim() || "Unspecified",
          polarity: c.polarity ?? "asserts",
          stance: stanceVal,
          extraction_confidence: conf,
          span_start: claimProv.span_start ?? null,
          span_end: claimProv.span_end ?? null,
          metadata: claimProv,
          run_id: runId,
        })
        .select("story_claim_id")
        .single();
      if (ins?.story_claim_id) claimIds.push(ins.story_claim_id);
    }

    const skippedEmpty = claimIds.length === 0;
    await supabase
      .from("stories")
      .update({
        merged_at: new Date().toISOString(),
        extraction_completed_at: new Date().toISOString(),
        extraction_skipped_empty: skippedEmpty,
        extraction_qa_status: "pending",
        extraction_qa_review_report: null,
        extraction_qa_validation_report: null,
        extraction_qa_refinement_count: 0,
        extraction_qa_validated_at: null,
      })
      .eq("story_id", storyId);

    totalClaims += claimIds.length;
    processed += 1;
    if (!dryRun) {
      await recordStoryStepRun(supabase, {
        storyId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "success",
        trigger: resolveStoryStepTrigger(singleStoryId),
        pipelineRunId: runId,
        meta: { story_claims: claimIds.length, skipped_empty: skippedEmpty, model_name: MODEL },
      });
    }
  }

  if (!dryRun && runId) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        counts: { stories: processed, story_claims: totalClaims },
      })
      .eq("run_id", runId);
  }

  return json({
    ok: true,
    processed,
    story_claims: totalClaims,
    dry_run: dryRun,
    run_id: runId,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
