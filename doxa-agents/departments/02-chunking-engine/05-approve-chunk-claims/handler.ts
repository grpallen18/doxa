// Per-claim approval for repaired claims only. Parks approved; re-queues or rejects others.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { loadActiveResponseSchema } from "../../../lib/agent-response-schema.ts";
import {
  applyApprovalVerdicts,
  assembleMergeClaims,
  buildApprovalPayload,
  isChunkMergeReady,
  loadClaimsMergeEligibility,
  repairQueueClaimIds,
} from "../../../lib/extraction-qa/claim-merge-state.ts";
import { getActiveClaimVersion } from "../../../lib/extraction-qa/claim-versions.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import { approveChunkClaims, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { asExtractionJson, clampInt, corsHeaders, json } from "../../../lib/extraction-qa/types.ts";
import { PipelineDebugTrace } from "../../../lib/pipeline-debug-trace.ts";
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "approve-chunk-claims";
const DEPLOY_NAME = "approve_chunk_claims";
const DEFAULT_MAX = 5;
const OPENAI_TIMEOUT_MS = 120_000;

function traceResponse(
  trace: PipelineDebugTrace,
  body: Record<string, unknown>,
  status = 200
) {
  return json({ ...body, debug_trace: trace.finish() }, status);
}

export const handler = async (req: Request) => {
  const trace = new PipelineDebugTrace(DEPLOY_NAME);
  let runId: string | null = null;

  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
    const MODEL = resolveChunkQaModel({
      OPENAI_MODEL_CHUNK_QA: Deno.env.get("OPENAI_MODEL_CHUNK_QA"),
      OPENAI_MODEL_EXTRACT: Deno.env.get("OPENAI_MODEL_EXTRACT"),
      OPENAI_MODEL: Deno.env.get("OPENAI_MODEL"),
    });

    if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
      return traceResponse(trace.fail("check_env", "Missing env"), { error: "Missing env" }, 500);
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await req.json().catch(() => ({}));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
    } catch {
      /* defaults */
    }

    const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
    if (invalidStoryId) {
      return traceResponse(trace.fail("parse_story_id", invalidUuidMessage("story_id")), {
        error: invalidUuidMessage("story_id"),
      }, 400);
    }

    const maxChunks = clampInt(body.max_chunks, 1, 20, DEFAULT_MAX);
    const dryRun = Boolean(body.dry_run ?? false);
    const chunkIndexParam =
      body.chunk_index !== undefined && body.chunk_index !== null
        ? clampInt(body.chunk_index, 0, 10_000, -1)
        : -1;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const activePrompt = await loadActivePrompt(supabase, STEP_ID);
    const activeResponseSchema = await loadActiveResponseSchema(supabase, STEP_ID);

    const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
      p_stage: "approve_claims",
      p_limit: maxChunks * 2,
    });
    if (rpcErr) {
      return traceResponse(trace.fail("fetch_approve_queue", rpcErr.message), { error: rpcErr.message }, 500);
    }

    let chunks = (rows ?? []) as Array<{
      story_id: string;
      chunk_index: number;
      content: string;
      extraction_json: unknown;
    }>;
    if (singleStoryId) chunks = chunks.filter((c) => c.story_id === singleStoryId);
    if (chunkIndexParam >= 0) chunks = chunks.filter((c) => c.chunk_index === chunkIndexParam);
    chunks = chunks.slice(0, maxChunks);

    if (chunks.length === 0) {
      if (!dryRun && singleStoryId) {
        await recordStoryStepRun(supabase, {
          storyId: singleStoryId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "no_op",
          trigger: resolveStoryStepTrigger(singleStoryId),
          chunkIndex: chunkIndexParam >= 0 ? chunkIndexParam : null,
          meta: { message: "No chunks ready for claims approval" },
        });
      }
      return traceResponse(trace, {
        ok: true,
        processed: 0,
        message: "No chunks ready for claims approval",
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }

    if (!dryRun) {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "approve_chunk_claims",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
          prompt_version_id: activePrompt.versionId,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    }

    let processed = 0;
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    const requestId = `approve-claims-${Date.now()}`;

    for (const chunk of chunks) {
      const sourceText = chunk.content ?? "";
      const mergeState = await loadClaimsMergeEligibility(supabase, chunk.story_id, chunk.chunk_index);
      const activeVersion = await getActiveClaimVersion(supabase, chunk.story_id, chunk.chunk_index);
      const versionClaims = asExtractionJson(activeVersion?.claims_json ?? chunk.extraction_json)
        .claims as Array<Record<string, unknown>>;
      const approvalClaims = buildApprovalPayload(mergeState, versionClaims);

      if (approvalClaims.length === 0) {
        if (!dryRun) {
          const mergeReady = isChunkMergeReady(mergeState, { allowEmpty: true });
          const hasPending = (mergeState.pending_approval_claim_ids ?? []).length > 0;
          const nextStatus = mergeReady
            ? "passed"
            : repairQueueClaimIds(mergeState).length > 0
              ? "needs_refinement"
              : hasPending
                ? "awaiting_approval"
                : "needs_human_review";

          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update({
              extraction_qa_status: nextStatus,
              extraction_json: assembleMergeClaims(mergeState),
              extraction_qa_validated_at: mergeReady ? new Date().toISOString() : null,
            })
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index);

          if (updateErr) throw new Error(updateErr.message);
        }

        processed += 1;
        processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
        continue;
      }

      const storyMetadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);
      const approvalResult = await approveChunkClaims(
        OPENAI_API_KEY,
        MODEL,
        activePrompt.systemPrompt,
        {
          ...metadataPayload(storyMetadata),
          chunk_text: sourceText,
          claims: approvalClaims,
        },
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`,
        activeResponseSchema
          ? { schema: activeResponseSchema.schema, schemaName: activeResponseSchema.schemaName }
          : undefined,
        OPENAI_TIMEOUT_MS
      );

      if (!dryRun) {
        const { data: savedArtifact, error: artifactErr } = await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_approve_claims",
          input_snapshot: { claims: approvalClaims },
          report: { verdicts: approvalResult.verdicts },
          run_id: runId,
          claim_version_id: activeVersion?.id ?? null,
        });
        if (artifactErr) throw new Error(artifactErr.message);

        const nextMergeState = applyApprovalVerdicts(
          mergeState,
          approvalClaims,
          approvalResult.verdicts.map((v) => ({
            claim_id: v.claim_id,
            approved: v.approved,
            reason: v.reason,
            fixable: v.fixable,
          })),
          {
            source_version_id: activeVersion?.id ?? "",
            artifact_id: savedArtifact?.id ?? "",
          }
        );

        const mergeReady = isChunkMergeReady(nextMergeState, { allowEmpty: true });
        const hasPending = (nextMergeState.pending_approval_claim_ids ?? []).length > 0;
        const nextStatus = mergeReady
          ? "passed"
          : repairQueueClaimIds(nextMergeState).length > 0
            ? "needs_refinement"
            : hasPending
              ? "awaiting_approval"
              : "needs_human_review";

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_qa_status: nextStatus,
            claims_merge_eligibility: nextMergeState,
            extraction_json: assembleMergeClaims(nextMergeState),
            extraction_qa_validated_at: mergeReady ? new Date().toISOString() : null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) throw new Error(updateErr.message);
      }

      processed += 1;
      processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
    }

    if (processed > 0) {
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
    }

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

    return traceResponse(trace, {
      ok: true,
      processed,
      dry_run: dryRun,
      model: MODEL,
      run_id: runId,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message, debug_trace: trace.fail("handler_unhandled", message) }, 500);
  }
};
