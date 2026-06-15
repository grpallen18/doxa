// Supabase Edge Function: extract primary claims from story chunks (LLM).
// Writes claims-only extraction_json to story_chunks.
// Pipeline: chunk_story_bodies -> extract_story_claims -> validate_chunk_claims -> merge_story_claims.

import { createClient } from "npm:@supabase/supabase-js@2";
import { EXTRACT_CLAIMS_JSON_SCHEMA } from "../../../lib/extraction-qa/atom-schema.ts";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import {
  buildExtractClaimsUserPayload,
  callOpenAIJson,
  saveArtifact,
} from "../../../lib/extraction-qa/openai-qa.ts";
import { ensureStableClaimIds } from "../../../lib/extraction-qa/claim-ids.ts";
import {
  deleteClaimVersionsForChunk,
  insertClaimVersion,
} from "../../../lib/extraction-qa/claim-versions.ts";
import { attachClaimsFromRawText } from "../../../lib/extraction-qa/span-compute.ts";
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

const STEP_ID = "extract-story-claims";
const DEPLOY_NAME = "extract_story_claims";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MAX_CHUNKS = 5;
/** Stay under Supabase Edge ~150s idle limit (one OpenAI call per chunk). */
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

async function callOpenAIClaims(
  apiKey: string,
  model: string,
  systemPrompt: string,
  metadata: StoryAgentMetadata,
  content: string,
  storyId: string,
  chunkIndex: number,
  requestId: string
): Promise<{ claims: unknown[] }> {
  const userPayload = buildExtractClaimsUserPayload(metadataPayload(metadata), content);

  const parsed = await withTimeout(
    callOpenAIJson<{ claims?: Array<{ raw_text?: string; claim_text?: string }> }>(
      apiKey,
      model,
      systemPrompt,
      userPayload,
      "doxa_extract_story_claims",
      EXTRACT_CLAIMS_JSON_SCHEMA as unknown as Record<string, unknown>,
      requestId,
      false,
      OPENAI_TIMEOUT_MS
    ),
    OPENAI_TIMEOUT_MS,
    `OpenAI extract (${model})`
  );

  const claimsRaw = (Array.isArray(parsed?.claims) ? parsed.claims : []).map((c) => ({
    raw_text: String(c?.raw_text ?? c?.claim_text ?? "").trim(),
  })).filter((c) => c.raw_text.length > 0);

  const attached = attachClaimsFromRawText(claimsRaw, storyId, chunkIndex, content);
  const claims = await ensureStableClaimIds(attached, storyId, chunkIndex);
  return { claims };
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
  const pingOpenai = Boolean(body.ping_openai ?? false);
  const chunkIndexParam =
    body.chunk_index !== undefined && body.chunk_index !== null
      ? clampInt(body.chunk_index, 0, 10_000, -1)
      : -1;

  if (pingOpenai) {
    const t0 = Date.now();
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: "Reply with JSON: {\"ok\":true}" }],
          response_format: { type: "json_object" },
          max_tokens: 32,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await resp.text();
      return json({
        ok: resp.ok,
        model: MODEL,
        openai_ms: Date.now() - t0,
        openai_status: resp.status,
        openai_preview: text.slice(0, 300),
      });
    } catch (e) {
      return json({
        ok: false,
        model: MODEL,
        openai_ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      }, 500);
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let fetchQuery = supabase
    .from("story_chunks")
    .select("story_id, chunk_index, content")
    .is("extraction_json", null);
  if (singleStoryId) fetchQuery = fetchQuery.eq("story_id", singleStoryId);
  if (chunkIndexParam >= 0) fetchQuery = fetchQuery.eq("chunk_index", chunkIndexParam);
  const { data: chunksRaw, error: fetchErr } = await fetchQuery
    .order("story_id", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(singleStoryId ? 100 : maxChunks);

  if (fetchErr) {
    console.error("[extract_story_claims] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const chunks = (Array.isArray(chunksRaw) ? chunksRaw : []).filter(
    (c): c is { story_id: string; chunk_index: number; content: string } =>
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
        meta: { message: "No chunks to extract" },
      });
    }
    return json({
      ok: true,
      processed: 0,
      message: "No chunks to extract",
      ...testScopeFields({ storyId: singleStoryId }),
      chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : undefined,
    });
  }

  console.log(
    `[extract_story_claims] start model=${MODEL} chunks=${chunks.length} story=${singleStoryId ?? "batch"}`
  );

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
    activePrompt = await loadActivePrompt(supabase, "extract-story-claims");
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
          pipeline_name: "extract_story_claims",
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

  const requestId = `extract-claims-${Date.now()}`;
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

      const result = await callOpenAIClaims(
        OPENAI_API_KEY,
        MODEL,
        activePrompt.systemPrompt,
        metadata,
        chunk.content ?? "",
        chunk.story_id,
        chunk.chunk_index,
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      if (!dryRun) {
        const extractionJson = { claims: result.claims };
        const now = new Date().toISOString();

        await deleteClaimVersionsForChunk(supabase, chunk.story_id, chunk.chunk_index);

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: extractionJson,
            active_claim_version_id: null,
            extraction_completed_at: now,
            extraction_qa_status: "pending",
            extraction_qa_review_report: null,
            extraction_qa_standardization_report: null,
            extraction_qa_validation_report: null,
            extraction_qa_refinement_count: 0,
            extraction_qa_validation_attempt_count: 0,
            extraction_qa_validated_at: null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          console.error("[extract_story_claims] Update error:", updateErr.message);
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

        const versionId = await insertClaimVersion(supabase, {
          storyId: chunk.story_id,
          chunkIndex: chunk.chunk_index,
          versionNumber: 0,
          source: "extractor",
          claimsJson: extractionJson,
          runId: runId,
        });

        const { error: pointerErr } = await supabase
          .from("story_chunks")
          .update({ active_claim_version_id: versionId })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (pointerErr) {
          await supabase.from("chunk_claim_versions").delete().eq("id", versionId);
          console.error("[extract_story_claims] Pointer error:", pointerErr.message);
          await recordStoryStepRun(supabase, {
            storyId: chunk.story_id,
            stepId: STEP_ID,
            deployName: DEPLOY_NAME,
            outcome: "failure",
            trigger: resolveStoryStepTrigger(singleStoryId),
            pipelineRunId: runId,
            chunkIndex: chunk.chunk_index,
            error: pointerErr.message,
          });
          return json({ error: pointerErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }

        const { error: artifactErr } = await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_extract_claims",
          output_snapshot: extractionJson,
          claim_version_id: versionId,
          run_id: runId,
        });
        if (artifactErr) {
          console.error("[extract_story_claims] Artifact error:", artifactErr.message);
        }
      }

      processed += 1;
      processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[extract_story_claims] Error for chunk:", chunk.story_id, chunk.chunk_index, msg);
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
    lane: "claims",
    pipelineRunId: runId,
    chunkIndexParam: chunkIndexParam,
    processedChunks,
    dryRun,
    modelName: MODEL,
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
