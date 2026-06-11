// Supabase Edge Function: extract positions from story chunks (LLM).
// Writes positions-only positions_extraction_json to story_chunks (parallel to claims).

import { createClient } from "npm:@supabase/supabase-js@2";
import { EXTRACT_POSITIONS_JSON_SCHEMA } from "../../../lib/extraction-qa/atom-schema.ts";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import {
  buildExtractPositionsUserPayload,
  callOpenAIJson,
  saveArtifact,
} from "../../../lib/extraction-qa/openai-qa.ts";
import { ensureStablePositionIds } from "../../../lib/extraction-qa/position-ids.ts";
import { normalizeExtractedPositions } from "../../../lib/extraction-qa/position-normalize.ts";
import {
  loadStoryMetadataBatch,
  metadataPayload,
  type StoryAgentMetadata,
} from "../../../lib/extraction-qa/story-metadata.ts";
import { resolveExtractModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "extract-story-positions";
const DEPLOY_NAME = "extract_story_positions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MAX_CHUNKS = 5;
const OPENAI_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${ms}ms. Set OPENAI_MODEL_EXTRACT=gpt-4o-mini on Edge secrets.`
            )
          ),
        ms
      );
    }),
  ]);
}

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

async function callOpenAIPositions(
  apiKey: string,
  model: string,
  systemPrompt: string,
  metadata: StoryAgentMetadata,
  content: string,
  existingClaims: unknown[],
  storyId: string,
  chunkIndex: number,
  requestId: string
): Promise<{ positions: unknown[] }> {
  const userPayload = buildExtractPositionsUserPayload(
    metadataPayload(metadata),
    content,
    existingClaims
  );

  const parsed = await withTimeout(
    callOpenAIJson<{ positions?: unknown[] }>(
      apiKey,
      model,
      systemPrompt,
      userPayload,
      "doxa_extract_story_positions",
      EXTRACT_POSITIONS_JSON_SCHEMA as unknown as Record<string, unknown>,
      requestId,
      true,
      OPENAI_TIMEOUT_MS
    ),
    OPENAI_TIMEOUT_MS,
    `OpenAI extract positions (${model})`
  );

  const normalized = normalizeExtractedPositions(
    Array.isArray(parsed?.positions) ? parsed.positions : [],
    storyId,
    chunkIndex,
    content
  );
  const positions = await ensureStablePositionIds(normalized, storyId, chunkIndex);
  return { positions };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = resolveExtractModel();

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

  const maxChunks = clampInt(body.max_chunks, 1, 20, DEFAULT_MAX_CHUNKS);
  const dryRun = Boolean(body.dry_run ?? false);
  const skipLlm = Boolean(body.skip_llm ?? false);
  const chunkIndexParam =
    body.chunk_index !== undefined && body.chunk_index !== null
      ? clampInt(body.chunk_index, 0, 10_000, -1)
      : -1;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let fetchQuery = supabase
    .from("story_chunks")
    .select("story_id, chunk_index, content, extraction_json")
    .is("positions_extraction_json", null);
  if (singleStoryId) fetchQuery = fetchQuery.eq("story_id", singleStoryId);
  if (chunkIndexParam >= 0) fetchQuery = fetchQuery.eq("chunk_index", chunkIndexParam);
  const { data: chunksRaw, error: fetchErr } = await fetchQuery
    .order("story_id", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(singleStoryId ? 100 : maxChunks);

  if (fetchErr) {
    console.error("[extract_story_positions] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const chunks = (Array.isArray(chunksRaw) ? chunksRaw : []).filter(
    (c): c is { story_id: string; chunk_index: number; content: string; extraction_json: unknown } =>
      typeof c === "object" && c !== null && typeof (c as { story_id: unknown }).story_id === "string"
  );

  if (chunks.length === 0) {
    if (!dryRun && singleStoryId) {
      await recordStoryStepRun(supabase, {
        storyId: singleStoryId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "no_op",
        trigger: resolveStoryStepTrigger(singleStoryId),
        chunkIndex: chunkIndexParam >= 0 ? chunkIndexParam : null,
        meta: { message: "No chunks to extract positions" },
      });
    }
    return json({
      ok: true,
      processed: 0,
      message: "No chunks to extract positions",
      ...testScopeFields({ storyId: singleStoryId }),
      chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : undefined,
    });
  }

  if (skipLlm) {
    return json({
      ok: true,
      processed: chunks.length,
      model: MODEL,
      skip_llm: true,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  let activePrompt;
  try {
    activePrompt = await loadActivePrompt(supabase, "extract-story-positions");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }

  let runId: string | null = null;
  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "extract_story_positions",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
          prompt_version_id: activePrompt.versionId,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    } catch {
      /* continue */
    }
  }

  const requestId = `extract-positions-${Date.now()}`;
  let processed = 0;
  const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];

  const metadataByStory = await loadStoryMetadataBatch(
    supabase,
    chunks.map((c) => c.story_id)
  );

  for (const chunk of chunks) {
    try {
      const baseMeta = metadataByStory.get(chunk.story_id)!;
      const metadata: StoryAgentMetadata = { ...baseMeta, chunk_index: chunk.chunk_index };
      const claimsBlob =
        chunk.extraction_json !== null &&
        typeof chunk.extraction_json === "object" &&
        !Array.isArray(chunk.extraction_json)
          ? (chunk.extraction_json as { claims?: unknown[] }).claims
          : undefined;
      const existingClaims = Array.isArray(claimsBlob) ? claimsBlob : [];

      const result = await callOpenAIPositions(
        OPENAI_API_KEY,
        MODEL,
        activePrompt.systemPrompt,
        metadata,
        chunk.content ?? "",
        existingClaims,
        chunk.story_id,
        chunk.chunk_index,
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      if (!dryRun) {
        const extractionJson = { positions: result.positions };
        const now = new Date().toISOString();

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            positions_extraction_json: extractionJson,
            positions_extraction_completed_at: now,
            positions_qa_status: "pending",
            positions_qa_review_report: null,
            positions_qa_validation_report: null,
            positions_qa_refinement_count: 0,
            positions_qa_validation_attempt_count: 0,
            positions_qa_validated_at: null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          console.error("[extract_story_positions] Update error:", updateErr.message);
          await recordStoryStepRun(supabase, {
            storyId: chunk.story_id,
            stepId: STEP_ID,
            deployName: DEPLOY_NAME,
            outcome: "failure",
            trigger: resolveStoryStepTrigger(singleStoryId),
            pipelineRunId: runId,
            chunkIndex: chunk.chunk_index,
            error: updateErr.message,
          });
          return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }

        await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_extract_positions",
          output_snapshot: extractionJson,
        });
      }

      processed += 1;
      processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[extract_story_positions] Error for chunk:", chunk.story_id, chunk.chunk_index, msg);
      if (!dryRun) {
        await recordStoryStepRun(supabase, {
          storyId: chunk.story_id,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "failure",
          trigger: resolveStoryStepTrigger(singleStoryId),
          pipelineRunId: runId,
          chunkIndex: chunk.chunk_index,
          error: msg,
        });
        if (runId) {
          await supabase
            .from("pipeline_runs")
            .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
            .eq("run_id", runId);
        }
      }
      return json({ error: msg, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
    }
  }

  await logBatchChunkStepRuns(supabase, {
    stepId: STEP_ID,
    deployName: DEPLOY_NAME,
    trigger: resolveStoryStepTrigger(singleStoryId),
    lane: "positions",
    pipelineRunId: runId,
    chunkIndexParam: chunkIndexParam,
    processedChunks,
    dryRun,
  });

  if (!dryRun && runId) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        counts: { chunks: processed },
      })
      .eq("run_id", runId);
  }

  return json({
    ok: true,
    processed,
    model: MODEL,
    run_id: runId,
    dry_run: dryRun,
    skip_llm: skipLlm,
    ...testScopeFields({ storyId: singleStoryId }),
    chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : undefined,
  });
};
