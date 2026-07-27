// Repair claims in repair_queue only (full JSON replacement). Sets awaiting_approval.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { loadActiveResponseSchema } from "../../../lib/agent-response-schema.ts";
import {
  assembleMergeClaims,
  buildRepairPayload,
  finalizeClaimsCycleByDroppingRemainder,
  loadClaimsMergeEligibility,
  repairQueueClaimIds,
  setPendingApprovalClaims,
} from "../../../lib/extraction-qa/claim-merge-state.ts";
import {
  deleteClaimVersionById,
  getActiveClaimVersion,
  getNextClaimVersionNumber,
  insertClaimVersion,
  resolveReviewArtifactForRefine,
  verifyRefinementArtifactLink,
} from "../../../lib/extraction-qa/claim-versions.ts";
import {
  assertClaimIdsSubsetOf,
  remapRefinedClaimIds,
} from "../../../lib/extraction-qa/claim-ids.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import {
  normalizeChunkClaims,
  validateNormalizedClaimsForChunk,
} from "../../../lib/extraction-qa/normalize-claims.ts";
import { refineChunkClaimsReplacement, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  asExtractionJson,
  clampInt,
  CLAIMS_QA_COMPLETE_STATUS,
  corsHeaders,
  json,
  MAX_REFINEMENT_ATTEMPTS,
} from "../../../lib/extraction-qa/types.ts";
import { PipelineDebugTrace } from "../../../lib/pipeline-debug-trace.ts";
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "refine-chunk-claims";
const DEPLOY_NAME = "refine_chunk_claims";
const DEFAULT_MAX = 5;
const OPENAI_TIMEOUT_MS = 120_000;

async function markPipelineRunFailed(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  error: string,
  debugTrace?: Record<string, unknown> | null
) {
  if (!runId) return;
  await supabase
    .from("pipeline_runs")
    .update({
      status: "failed",
      ended_at: new Date().toISOString(),
      error,
      ...(debugTrace ? { counts: { debug_trace: debugTrace } } : {}),
    })
    .eq("run_id", runId);
}

function traceResponse(
  trace: PipelineDebugTrace,
  body: Record<string, unknown>,
  status = 200
) {
  return json({ ...body, debug_trace: trace.finish() }, status);
}

async function recordRefineAttemptFailure(
  supabase: ReturnType<typeof createClient>,
  chunk: { story_id: string; chunk_index: number },
  dryRun: boolean
): Promise<"needs_refinement" | typeof CLAIMS_QA_COMPLETE_STATUS> {
  const { data } = await supabase
    .from("story_chunks")
    .select("extraction_qa_refinement_count, claims_merge_eligibility")
    .eq("story_id", chunk.story_id)
    .eq("chunk_index", chunk.chunk_index)
    .single();

  const nextCount = (data?.extraction_qa_refinement_count ?? 0) + 1;
  const exhausted = nextCount >= MAX_REFINEMENT_ATTEMPTS;

  if (!dryRun) {
    if (exhausted) {
      const mergeState = finalizeClaimsCycleByDroppingRemainder(
        await loadClaimsMergeEligibility(supabase, chunk.story_id, chunk.chunk_index),
        { artifact_id: "", reason: "max_repair_attempts" }
      );
      const { error } = await supabase
        .from("story_chunks")
        .update({
          extraction_qa_refinement_count: nextCount,
          extraction_qa_status: CLAIMS_QA_COMPLETE_STATUS,
          claims_merge_eligibility: mergeState,
          extraction_json: assembleMergeClaims(mergeState),
          extraction_qa_validated_at: new Date().toISOString(),
        })
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index);
      if (error) throw new Error(error.message);
      return CLAIMS_QA_COMPLETE_STATUS;
    }

    const { error } = await supabase
      .from("story_chunks")
      .update({
        extraction_qa_refinement_count: nextCount,
        extraction_qa_status: "needs_refinement",
      })
      .eq("story_id", chunk.story_id)
      .eq("chunk_index", chunk.chunk_index);
    if (error) throw new Error(error.message);
  }

  return exhausted ? CLAIMS_QA_COMPLETE_STATUS : "needs_refinement";
}

export const handler = async (req: Request) => {
  const trace = new PipelineDebugTrace(DEPLOY_NAME);
  let runId: string | null = null;
  let lastChunkTrace: Record<string, unknown> | null = null;

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
      trace.fail("check_env", "Missing env");
      return traceResponse(trace, { error: "Missing env" }, 500);
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
      trace.fail("parse_story_id", invalidUuidMessage("story_id"));
      return traceResponse(trace, {
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
      p_stage: "refine",
      p_limit: maxChunks * 2,
    });
    if (rpcErr) {
      trace.fail("fetch_refine_queue", rpcErr.message);
      return traceResponse(trace, { error: rpcErr.message }, 500);
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
      const debug_trace = trace.finish();
      if (!dryRun && singleStoryId) {
        await recordStoryStepRun(supabase, {
          storyId: singleStoryId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "no_op",
          trigger: resolveStoryStepTrigger(singleStoryId),
          chunkIndex: chunkIndexParam >= 0 ? chunkIndexParam : null,
          meta: { message: "No chunks ready for claims refine", debug_trace },
        });
      }
      return json({
        ok: true,
        processed: 0,
        failed: 0,
        message: "No chunks ready for claims refine",
        debug_trace,
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }

    if (!dryRun) {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "refine_chunk_claims",
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
    let failed = 0;
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    const failedChunks: Array<{ story_id: string; chunk_index: number; error: string; status: string }> =
      [];
    const requestId = `refine-claims-${Date.now()}`;

    for (const chunk of chunks) {
      const chunkTrace = new PipelineDebugTrace(`${DEPLOY_NAME}:chunk-${chunk.chunk_index}`);
      try {
        const sourceText = chunk.content ?? "";
        const mergeState = await loadClaimsMergeEligibility(supabase, chunk.story_id, chunk.chunk_index);
        const queueIds = repairQueueClaimIds(mergeState);
        if (queueIds.length === 0) {
          chunkTrace.log("repair_queue", "skip", { reason: "empty_or_all_dropped" });
          if (!dryRun) {
            const cleaned = finalizeClaimsCycleByDroppingRemainder(mergeState, {
              artifact_id: "",
              reason: "stale_repair_queue",
            });
            const nextStatus = CLAIMS_QA_COMPLETE_STATUS;
            const { error: cleanErr } = await supabase
              .from("story_chunks")
              .update({
                extraction_qa_status: nextStatus,
                claims_merge_eligibility: cleaned,
                extraction_json: assembleMergeClaims(cleaned),
                extraction_qa_validated_at: new Date().toISOString(),
              })
              .eq("story_id", chunk.story_id)
              .eq("chunk_index", chunk.chunk_index);
            if (cleanErr) throw new Error(cleanErr.message);
          }
          processed += 1;
          processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
          continue;
        }

        const activeVersion = await getActiveClaimVersion(supabase, chunk.story_id, chunk.chunk_index);
        const inputClaims = asExtractionJson(activeVersion?.claims_json ?? chunk.extraction_json).claims as Array<
          Record<string, unknown>
        >;
        const repairClaims = buildRepairPayload(mergeState, inputClaims);
        if (repairClaims.length === 0) {
          throw new Error("repair_queue has ids but no matching claims in active version");
        }

        const inputVersionId = activeVersion?.id ?? null;
        if (!inputVersionId) {
          throw new Error("refine_requires_active_claim_version");
        }

        const reviewArtifact = await resolveReviewArtifactForRefine(
          supabase,
          chunk.story_id,
          chunk.chunk_index,
          inputVersionId
        );
        if (!reviewArtifact?.id) {
          throw new Error(
            "refine_requires_review_artifact: no chunk_review_claims artifact for input version"
          );
        }
        const reviewArtifactId = reviewArtifact.id;

        const storyMetadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

        const llmResult = await refineChunkClaimsReplacement(
          OPENAI_API_KEY,
          MODEL,
          activePrompt.systemPrompt,
          {
            story: metadataPayload(storyMetadata),
            chunk: { chunk_text: sourceText, chunk_index: chunk.chunk_index },
            active_claim_version: { claims: repairClaims },
            review_artifact: reviewArtifact?.report ?? {},
            repair_queue: mergeState.repair_queue,
          },
          `${requestId}-${chunk.story_id}-${chunk.chunk_index}`,
          activeResponseSchema
            ? { schema: activeResponseSchema.schema, schemaName: activeResponseSchema.schemaName }
            : undefined,
          OPENAI_TIMEOUT_MS
        );

        const nextRefinementCount =
          ((await supabase
            .from("story_chunks")
            .select("extraction_qa_refinement_count")
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index)
            .single()).data?.extraction_qa_refinement_count ?? 0) + 1;

        const remapped = remapRefinedClaimIds(llmResult.claims, repairClaims);
        if (remapped.droppedExtras > 0) {
          chunkTrace.log("drop_extra_claims", "ok", {
            dropped_extras: remapped.droppedExtras,
            repair_inputs: repairClaims.length,
            model_outputs: Array.isArray(llmResult.claims) ? llmResult.claims.length : 0,
          });
        }
        const allowedClaimIds = remapped.claims
          .map((claim) => (typeof claim.claim_id === "string" ? claim.claim_id : null))
          .filter((id): id is string => id != null);

        const normalized = await normalizeChunkClaims(
          remapped.claims,
          chunk.story_id,
          chunk.chunk_index,
          sourceText,
          { refinementCycle: nextRefinementCount, preserveClaimIds: true }
        );
        assertClaimIdsSubsetOf(normalized.claims, allowedClaimIds);

        const validation = validateNormalizedClaimsForChunk(
          normalized.claims,
          chunk.story_id,
          chunk.chunk_index,
          sourceText
        );
        if (!validation.valid) {
          throw new Error(`refiner_validation_failed: ${validation.errors.join("; ")}`);
        }

        if (!dryRun) {
          const nextVersionNumber = await getNextClaimVersionNumber(
            supabase,
            chunk.story_id,
            chunk.chunk_index
          );

          const outputVersionId = await insertClaimVersion(supabase, {
            storyId: chunk.story_id,
            chunkIndex: chunk.chunk_index,
            versionNumber: nextVersionNumber,
            source: "refiner",
            claimsJson: { claims: normalized.claims },
            parentVersionId: inputVersionId,
            createdFromReviewArtifactId: reviewArtifactId,
            runId: runId,
          });

          const { data: savedArtifact, error: artifactErr } = await saveArtifact(supabase, {
            story_id: chunk.story_id,
            chunk_index: chunk.chunk_index,
            stage: "chunk_refine_claims",
            input_snapshot: { claims: repairClaims },
            output_snapshot: { claims: normalized.claims },
            report: {
              refinement_cycle: nextRefinementCount,
              repair_queue_ids: queueIds,
              input_claim_version_id: inputVersionId,
              output_claim_version_id: outputVersionId,
              source_review_artifact_id: reviewArtifactId,
              dropped_extras: remapped.droppedExtras,
              validation,
            },
            run_id: runId,
            input_claim_version_id: inputVersionId,
            output_claim_version_id: outputVersionId,
          });

          if (artifactErr) {
            await deleteClaimVersionById(supabase, outputVersionId);
            throw new Error(artifactErr.message);
          }

          if (!savedArtifact?.id) {
            await deleteClaimVersionById(supabase, outputVersionId);
            throw new Error("refinement_artifact_link_failed: artifact id missing after save");
          }

          try {
            await verifyRefinementArtifactLink(supabase, savedArtifact.id, outputVersionId);
          } catch (linkErr) {
            await supabase
              .from("story_extraction_qa_artifacts")
              .delete()
              .eq("id", savedArtifact.id);
            await deleteClaimVersionById(supabase, outputVersionId);
            throw linkErr;
          }

          const pendingIds = normalized.claims
            .map((c) => (typeof c.claim_id === "string" ? c.claim_id : null))
            .filter((id): id is string => id != null);

          const nextMergeState = setPendingApprovalClaims(mergeState, pendingIds, outputVersionId);

          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update({
              active_claim_version_id: outputVersionId,
              extraction_qa_status: "awaiting_approval",
              extraction_qa_refinement_count: nextRefinementCount,
              claims_merge_eligibility: nextMergeState,
            })
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index);

          if (updateErr) {
            if (savedArtifact?.id) {
              await supabase
                .from("story_extraction_qa_artifacts")
                .delete()
                .eq("id", savedArtifact.id);
            }
            await deleteClaimVersionById(supabase, outputVersionId);
            throw new Error(updateErr.message);
          }
        }

        processed += 1;
        processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
        chunkTrace.log("refine_complete", "ok", {
          dropped_extras: remapped.droppedExtras,
          claim_count: normalized.claims.length,
        });
        lastChunkTrace = chunkTrace.finish();
        trace.log(`chunk_${chunk.chunk_index}`, "ok");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failed += 1;

        let escalatedStatus: string = "needs_refinement";
        try {
          escalatedStatus = await recordRefineAttemptFailure(supabase, chunk, dryRun);
        } catch (statusErr) {
          const statusMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
          chunkTrace.log("refine_fail_status", "fail", undefined, statusMsg);
        }

        chunkTrace.log("refine_failed", "fail", { escalated_status: escalatedStatus }, msg);
        lastChunkTrace = chunkTrace.finish();

        failedChunks.push({
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          error: msg,
          status: escalatedStatus,
        });

        await recordStoryStepRun(supabase, {
          storyId: chunk.story_id,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "failure",
          trigger: resolveStoryStepTrigger(singleStoryId),
          pipelineRunId: runId,
          chunkIndex: chunk.chunk_index,
          error: msg,
          meta: {
            debug_trace: lastChunkTrace,
            escalated_status: escalatedStatus,
          },
        });
        trace.log(`chunk_${chunk.chunk_index}`, "fail", { escalated_status: escalatedStatus }, msg);
      }
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
        debugTrace: lastChunkTrace,
      });
    }

    if (!dryRun && runId) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          counts: { chunks: processed, failed, failed_chunks: failedChunks },
        })
        .eq("run_id", runId);
    }

    const firstError = failedChunks[0]?.error ?? null;
    return traceResponse(trace, {
      ok: failed === 0,
      processed,
      failed,
      failed_chunks: failedChunks,
      dry_run: dryRun,
      model: MODEL,
      run_id: runId,
      ...(firstError ? { error: firstError, chunk_debug_trace: lastChunkTrace } : {}),
      ...testScopeFields({ storyId: singleStoryId }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const debug_trace = trace.fail("handler_unhandled", message);
    if (runId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && serviceRole) {
        const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
        await markPipelineRunFailed(supabase, runId, message, debug_trace);
      }
    }
    return json({ error: message, debug_trace }, 500);
  }
};
