// Refine claims-only chunk extraction from review findings (max three cycles).
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }
// Optional env: OPENAI_MODEL_CHUNK_QA (falls back to OPENAI_MODEL_EXTRACT, OPENAI_MODEL).

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { ensureStableClaimIds } from "../../../lib/extraction-qa/claim-ids.ts";
import {
  getActiveClaimVersion,
  getLatestReviewArtifactForChunk,
  getReviewArtifactForClaimVersion,
  getNextClaimVersionNumber,
  insertClaimVersion,
  deleteClaimVersionById,
} from "../../../lib/extraction-qa/claim-versions.ts";
import { applyPatches } from "../../../lib/extraction-qa/apply-patches.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import {
  checkBlockingClaimsReviewUnresolved,
  runStrictPreValidation,
} from "../../../lib/extraction-qa/deterministic-checks.ts";
import { refineChunkClaims, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { attachClaimsFromRawText } from "../../../lib/extraction-qa/span-compute.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  asExtractionJson,
  clampInt,
  corsHeaders,
  json,
  MAX_REFINEMENT_ATTEMPTS,
  type ClaimsReviewReport,
  type RefinementPatchOp,
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
/** Stay under admin invoke timeout (150s) and Supabase edge wall clock. */
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

function normalizeClaimsExtraction(
  extraction: ReturnType<typeof asExtractionJson>,
  storyId: string,
  chunkIndex: number,
  sourceText: string
) {
  const claimsRaw = (Array.isArray(extraction.claims) ? extraction.claims : [])
    .map((c) => {
      const row = c as Record<string, unknown>;
      const raw_text = String(row.raw_text ?? "").trim();
      if (!raw_text) return null;
      return {
        raw_text,
        claim_id: typeof row.claim_id === "string" ? row.claim_id : undefined,
      };
    })
    .filter((c): c is { raw_text: string; claim_id?: string } => c != null);

  const attached = attachClaimsFromRawText(claimsRaw, storyId, chunkIndex, sourceText);
  return {
    claims: attached.map((claim, index) => ({
      ...claim,
      claim_id: claimsRaw[index]?.claim_id ?? claim.claim_id,
    })),
  };
}

function traceResponse(
  trace: PipelineDebugTrace,
  body: Record<string, unknown>,
  status = 200
) {
  const debug_trace = trace.finish();
  return json({ ...body, debug_trace }, status);
}

export const handler = async (req: Request) => {
  const trace = new PipelineDebugTrace(DEPLOY_NAME);
  let runId: string | null = null;
  let lastChunkTrace: Record<string, unknown> | null = null;

  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    trace.log("request_received", "ok", { method: req.method });

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
    trace.log("check_env", "ok", { model: MODEL, openai_timeout_ms: OPENAI_TIMEOUT_MS });

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

    trace.log("parse_request", "ok", {
      story_id: singleStoryId,
      chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : null,
      max_chunks: maxChunks,
      dry_run: dryRun,
    });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    let activePrompt;
    try {
      activePrompt = await loadActivePrompt(supabase, STEP_ID);
      trace.log("load_prompt", "ok", { prompt_version_id: activePrompt.versionId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return traceResponse(trace.fail("load_prompt", msg), { error: msg }, 500);
    }

    const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
      p_stage: "refine",
      p_limit: maxChunks * 2,
    });

    if (rpcErr) {
      return traceResponse(trace.fail("fetch_refine_queue", rpcErr.message), { error: rpcErr.message }, 500);
    }

    const queueCount = Array.isArray(rows) ? rows.length : 0;
    trace.log("fetch_refine_queue", "ok", { queue_count: queueCount });

    let chunks = (rows ?? []) as Array<{
      story_id: string;
      chunk_index: number;
      content: string;
      extraction_json: unknown;
    }>;

    const beforeFilter = chunks.length;
    if (singleStoryId) chunks = chunks.filter((c) => c.story_id === singleStoryId);
    if (chunkIndexParam >= 0) chunks = chunks.filter((c) => c.chunk_index === chunkIndexParam);
    chunks = chunks.slice(0, maxChunks);

    trace.log("filter_chunks", chunks.length > 0 ? "ok" : "skip", {
      before_filter: beforeFilter,
      after_filter: chunks.length,
      chunk_indices: chunks.map((c) => c.chunk_index),
    });

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
        message: "No chunks ready for claims refine",
        debug_trace,
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }

    if (!dryRun) {
      try {
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
        trace.log("create_pipeline_run", runId ? "ok" : "skip", { run_id: runId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        trace.log("create_pipeline_run", "skip", { error: msg });
      }
    } else {
      trace.log("create_pipeline_run", "skip", { dry_run: true });
    }

    let processed = 0;
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    let hadChunkFailures = false;
    const requestId = `refine-claims-${Date.now()}`;

    for (const chunk of chunks) {
      const chunkTrace = new PipelineDebugTrace(`${DEPLOY_NAME}:chunk-${chunk.chunk_index}`);
      chunkTrace.log("chunk_start", "ok", {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
      });

      try {
        const { data: meta, error: metaErr } = await supabase
          .from("story_chunks")
          .select(
            "extraction_qa_status, extraction_qa_review_report, extraction_qa_refinement_count, active_claim_version_id"
          )
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index)
          .single();

        if (metaErr) {
          throw new Error(`load_chunk_meta: ${metaErr.message}`);
        }
        chunkTrace.log("load_chunk_meta", "ok", {
          extraction_qa_status: meta?.extraction_qa_status ?? null,
          refinement_count: meta?.extraction_qa_refinement_count ?? 0,
          active_claim_version_id: meta?.active_claim_version_id ?? null,
        });

        const refinementCount = meta?.extraction_qa_refinement_count ?? 0;
        if (refinementCount >= MAX_REFINEMENT_ATTEMPTS) {
          chunkTrace.log("check_refinement_limit", "skip", {
            refinement_count: refinementCount,
            max: MAX_REFINEMENT_ATTEMPTS,
          });
          lastChunkTrace = chunkTrace.finish();
          trace.log("process_chunk", "skip", {
            chunk_index: chunk.chunk_index,
            reason: "refinement_limit_reached",
          });
          continue;
        }
        chunkTrace.log("check_refinement_limit", "ok", { refinement_count: refinementCount });

        const reviewReport = (meta?.extraction_qa_review_report ?? {}) as ClaimsReviewReport;
        const activeVersion = await getActiveClaimVersion(
          supabase,
          chunk.story_id,
          chunk.chunk_index
        );
        chunkTrace.log("load_active_version", "ok", {
          active_version_id: activeVersion?.id ?? null,
          active_version_number: activeVersion?.version_number ?? null,
        });

        const inputVersionIdFromReport =
          typeof reviewReport.reviewed_claim_version_id === "string"
            ? reviewReport.reviewed_claim_version_id
            : null;
        const inputVersionId = inputVersionIdFromReport ?? activeVersion?.id ?? null;
        chunkTrace.log("resolve_input_version", "ok", {
          from_report: inputVersionIdFromReport,
          resolved_input_version_id: inputVersionId,
        });

        let reviewArtifactSource: "claim_version" | "latest_fallback" | null = null;
        let sourceReviewArtifact =
          inputVersionId != null
            ? await getReviewArtifactForClaimVersion(
                supabase,
                chunk.story_id,
                chunk.chunk_index,
                inputVersionId
              )
            : null;
        if (sourceReviewArtifact?.id) {
          reviewArtifactSource = "claim_version";
        }
        if (!sourceReviewArtifact?.id) {
          const fallbackReview = await getLatestReviewArtifactForChunk(
            supabase,
            chunk.story_id,
            chunk.chunk_index
          );
          if (fallbackReview?.id) {
            sourceReviewArtifact = { id: fallbackReview.id };
            reviewArtifactSource = "latest_fallback";
          }
        }
        if (!sourceReviewArtifact?.id) {
          chunkTrace.log("load_review_artifact", "fail", {
            input_version_id: inputVersionId,
            tried_claim_version_match: inputVersionId != null,
            tried_latest_fallback: true,
          }, "No review artifact found for chunk awaiting refinement");
          lastChunkTrace = chunkTrace.finish();
          hadChunkFailures = true;
          await recordStoryStepRun(supabase, {
            storyId: chunk.story_id,
            stepId: STEP_ID,
            deployName: DEPLOY_NAME,
            outcome: "failure",
            trigger: resolveStoryStepTrigger(singleStoryId),
            pipelineRunId: runId,
            chunkIndex: chunk.chunk_index,
            error: "No review artifact found for chunk awaiting refinement",
            meta: { debug_trace: lastChunkTrace, error_code: "missing_review_artifact" },
          });
          trace.log("process_chunk", "fail", {
            chunk_index: chunk.chunk_index,
            reason: "missing_review_artifact",
          });
          continue;
        }
        chunkTrace.log("load_review_artifact", "ok", {
          review_artifact_id: sourceReviewArtifact.id,
          source: reviewArtifactSource,
        });

        let inputClaimsJson = activeVersion?.claims_json ?? chunk.extraction_json;
        if (inputVersionId && inputVersionId !== activeVersion?.id) {
          const { data: inputVersionRow } = await supabase
            .from("chunk_claim_versions")
            .select("claims_json")
            .eq("id", inputVersionId)
            .single();
          if (inputVersionRow?.claims_json) {
            inputClaimsJson = inputVersionRow.claims_json;
          }
        }
        const claimCount = Array.isArray(asExtractionJson(inputClaimsJson).claims)
          ? asExtractionJson(inputClaimsJson).claims.length
          : 0;
        chunkTrace.log("load_input_claims", "ok", {
          input_version_id: inputVersionId,
          claim_count: claimCount,
        });

        const extraction = asExtractionJson(inputClaimsJson);
        const sourceText = chunk.content ?? "";
        const storyMetadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);
        chunkTrace.log("load_story_metadata", "ok", {
          chunk_text_length: sourceText.length,
        });

        const refineResult = await refineChunkClaims(
          OPENAI_API_KEY,
          MODEL,
          activePrompt.systemPrompt,
          {
            ...metadataPayload(storyMetadata),
            chunk_text: sourceText,
            extraction_json: extraction,
            review_report: reviewReport,
          },
          `${requestId}-${chunk.story_id}-${chunk.chunk_index}`,
          OPENAI_TIMEOUT_MS
        );
        chunkTrace.log("openai_refine", "ok", {
          patch_count: refineResult.patches?.length ?? 0,
          ignored_findings_count: refineResult.ignored_findings?.length ?? 0,
        });

        const { patches, ignored_findings } = refineResult;

        const normalizedPatches: RefinementPatchOp[] = (patches ?? [])
          .filter((p) => p && p.op && p.entity_type === "claim")
          .map((p) => {
            const patchValue =
              p.op === "add" || p.op === "update"
                ? (() => {
                    const value = { ...((p.value ?? {}) as Record<string, unknown>) };
                    delete value.claim_id;
                    return value;
                  })()
                : undefined;
            return {
              op: p.op as RefinementPatchOp["op"],
              entity_type: "claim",
              entity_index: p.entity_index ?? 0,
              ...(patchValue ? { value: patchValue } : {}),
            };
          }) as RefinementPatchOp[];

        const nextRefinementCount = refinementCount + 1;

        const patchedRaw = applyPatches(extraction, normalizedPatches);
        const normalized = normalizeClaimsExtraction(
          patchedRaw,
          chunk.story_id,
          chunk.chunk_index,
          sourceText
        );
        const patchedClaims = await ensureStableClaimIds(
          normalized.claims as Array<Record<string, unknown>>,
          chunk.story_id,
          chunk.chunk_index,
          { refinementCycle: nextRefinementCount }
        );
        const patched = { claims: patchedClaims };
        chunkTrace.log("apply_patches", "ok", {
          normalized_patch_count: normalizedPatches.length,
          output_claim_count: patchedClaims.length,
          next_refinement_count: nextRefinementCount,
        });

        const postRefineGate = runStrictPreValidation(sourceText, patched, {
          claimsOnly: true,
          atomsOnly: true,
        });

        const unresolvedBlocking = checkBlockingClaimsReviewUnresolved(
          reviewReport,
          extraction,
          patched,
          sourceText
        );

        const gateFailed = !postRefineGate.passes || unresolvedBlocking.length > 0;
        chunkTrace.log("post_refine_gate", gateFailed ? "skip" : "ok", {
          gate_passes: postRefineGate.passes,
          gate_failed: gateFailed,
          unresolved_blocking_count: unresolvedBlocking.length,
          next_status: gateFailed ? "needs_human_review" : "pending",
        });

        if (!dryRun) {
          const nextStatus = gateFailed ? "needs_human_review" : "pending";
          const nextVersionNumber = await getNextClaimVersionNumber(
            supabase,
            chunk.story_id,
            chunk.chunk_index
          );
          chunkTrace.log("allocate_version_number", "ok", { version_number: nextVersionNumber });

          const outputVersionId = await insertClaimVersion(supabase, {
            storyId: chunk.story_id,
            chunkIndex: chunk.chunk_index,
            versionNumber: nextVersionNumber,
            source: "refiner",
            claimsJson: patched,
            parentVersionId: inputVersionId,
            createdFromReviewArtifactId: sourceReviewArtifact?.id ?? null,
            runId: runId,
          });
          chunkTrace.log("insert_claim_version", "ok", {
            output_version_id: outputVersionId,
            parent_version_id: inputVersionId,
          });

          const { data: savedArtifact, error: artifactErr } = await saveArtifact(supabase, {
            story_id: chunk.story_id,
            chunk_index: chunk.chunk_index,
            stage: "chunk_refine_claims",
            input_snapshot: extraction,
            output_snapshot: patched,
            report: {
              refinement_cycle: nextRefinementCount,
              patches: normalizedPatches,
              ignored_findings: ignored_findings ?? [],
              post_refine_gate: postRefineGate,
              unresolved_blocking: unresolvedBlocking,
              input_claim_version_id: inputVersionId,
              output_claim_version_id: outputVersionId,
            },
            run_id: runId,
            input_claim_version_id: inputVersionId,
            output_claim_version_id: outputVersionId,
          });

          if (artifactErr) {
            await deleteClaimVersionById(supabase, outputVersionId);
            chunkTrace.log("save_refinement_artifact", "fail", {
              output_version_id: outputVersionId,
            }, artifactErr.message);
            lastChunkTrace = chunkTrace.finish();
            const debug_trace = trace.finish();
            if (!dryRun) {
              if (processedChunks.length > 0) {
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
              await recordStoryStepRun(supabase, {
                storyId: chunk.story_id,
                stepId: STEP_ID,
                deployName: DEPLOY_NAME,
                outcome: "failure",
                trigger: resolveStoryStepTrigger(singleStoryId),
                pipelineRunId: runId,
                chunkIndex: chunk.chunk_index,
                error: artifactErr.message,
                meta: { debug_trace: lastChunkTrace, invoke_debug_trace: debug_trace },
              });
              await markPipelineRunFailed(supabase, runId, artifactErr.message, debug_trace);
            }
            return json({
              error: artifactErr.message,
              debug_trace,
              chunk_debug_trace: lastChunkTrace,
            }, 500);
          }
          chunkTrace.log("save_refinement_artifact", "ok", {
            artifact_id: savedArtifact?.id ?? null,
          });

          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update({
              active_claim_version_id: outputVersionId,
              extraction_json: patched,
              extraction_qa_status: nextStatus,
              extraction_qa_refinement_count: nextRefinementCount,
              extraction_qa_validated_at: null,
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
            chunkTrace.log("update_chunk_row", "fail", {
              output_version_id: outputVersionId,
              artifact_id: savedArtifact?.id ?? null,
              rolled_back_artifact: Boolean(savedArtifact?.id),
              rolled_back_version: true,
            }, updateErr.message);
            lastChunkTrace = chunkTrace.finish();
            const debug_trace = trace.finish();
            if (!dryRun) {
              if (processedChunks.length > 0) {
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
              await recordStoryStepRun(supabase, {
                storyId: chunk.story_id,
                stepId: STEP_ID,
                deployName: DEPLOY_NAME,
                outcome: "failure",
                trigger: resolveStoryStepTrigger(singleStoryId),
                pipelineRunId: runId,
                chunkIndex: chunk.chunk_index,
                error: updateErr.message,
                meta: { debug_trace: lastChunkTrace, invoke_debug_trace: debug_trace },
              });
              await markPipelineRunFailed(supabase, runId, updateErr.message, debug_trace);
            }
            return json({
              error: updateErr.message,
              debug_trace,
              chunk_debug_trace: lastChunkTrace,
            }, 500);
          }
          chunkTrace.log("update_chunk_row", "ok", {
            active_claim_version_id: outputVersionId,
            extraction_qa_status: nextStatus,
            extraction_qa_refinement_count: nextRefinementCount,
          });
        } else {
          chunkTrace.log("persist_results", "skip", { dry_run: true });
        }

        lastChunkTrace = chunkTrace.finish();
        trace.log("process_chunk", "ok", {
          chunk_index: chunk.chunk_index,
          chunk_debug_trace: lastChunkTrace,
        });
        processed += 1;
        processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        chunkTrace.log("chunk_unhandled_error", "fail", undefined, msg);
        lastChunkTrace = chunkTrace.finish();
        const debug_trace = trace.finish();
        console.error("[refine_chunk_claims] Error:", chunk.story_id, chunk.chunk_index, msg);
        if (!dryRun) {
          if (processedChunks.length > 0) {
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
          await recordStoryStepRun(supabase, {
            storyId: chunk.story_id,
            stepId: STEP_ID,
            deployName: DEPLOY_NAME,
            outcome: "failure",
            trigger: resolveStoryStepTrigger(singleStoryId),
            pipelineRunId: runId,
            chunkIndex: chunk.chunk_index,
            error: msg,
            meta: { debug_trace: lastChunkTrace, invoke_debug_trace: debug_trace },
          });
          await markPipelineRunFailed(supabase, runId, msg, debug_trace);
        }
        return json({
          error: msg,
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          debug_trace,
          chunk_debug_trace: lastChunkTrace,
        }, 500);
      }
    }

    const debug_trace = trace.finish();

    if (processed === 0 && !dryRun && !hadChunkFailures) {
      const storyIds =
        singleStoryId != null
          ? [singleStoryId]
          : [...new Set(chunks.map((c) => c.story_id))];
      for (const storyId of storyIds) {
        await recordStoryStepRun(supabase, {
          storyId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "no_op",
          trigger: resolveStoryStepTrigger(singleStoryId),
          pipelineRunId: runId,
          chunkIndex: chunkIndexParam >= 0 ? chunkIndexParam : null,
          meta: { message: "No chunks refined this invoke", debug_trace },
        });
      }
    } else if (processed > 0) {
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
        debugTrace: lastChunkTrace ?? debug_trace,
      });
    }

    if (!dryRun && runId) {
      if (hadChunkFailures && processed === 0) {
        await markPipelineRunFailed(
          supabase,
          runId,
          "Refine preconditions failed for one or more chunks",
          debug_trace
        );
      } else {
        await supabase
          .from("pipeline_runs")
          .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            counts: { chunks: processed, debug_trace },
          })
          .eq("run_id", runId);
      }
    }

    if (hadChunkFailures && processed === 0) {
      return json(
        {
          ok: false,
          processed: 0,
          error: "Refine preconditions failed — see debug_trace",
          error_code: "refine_preconditions_failed",
          debug_trace,
          chunk_debug_trace: lastChunkTrace,
          dry_run: dryRun,
          model: MODEL,
          run_id: runId,
          ...testScopeFields({ storyId: singleStoryId }),
        },
        422
      );
    }

    return json({
      ok: true,
      processed,
      dry_run: dryRun,
      model: MODEL,
      run_id: runId,
      debug_trace,
      chunk_debug_trace: lastChunkTrace,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const debug_trace = trace.fail("handler_unhandled", message);
    if (runId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && serviceRole) {
          const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
          await markPipelineRunFailed(supabase, runId, message, debug_trace);
        }
      } catch {
        /* best effort */
      }
    }
    return json({ error: message, debug_trace }, 500);
  }
};
