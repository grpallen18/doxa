// Hybrid review for claims-only chunk extraction: deterministic pre-checks + LLM review.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }
// Optional env: OPENAI_MODEL_CHUNK_QA (falls back to OPENAI_MODEL_EXTRACT, OPENAI_MODEL).

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { loadActiveResponseSchema } from "../../../lib/agent-response-schema.ts";
import {
  autoPassEmptyExtraction,
  buildDeterministicClaimsReviewReport,
  getMaterialityWarnings,
  mergeAttributionDriftIntoClaimsReview,
  runStrictPreValidation,
} from "../../../lib/extraction-qa/deterministic-checks.ts";
import { ensureStableClaimIds } from "../../../lib/extraction-qa/claim-ids.ts";
import {
  getActiveClaimVersion,
  setClaimVersionReviewOutcome,
  updateClaimVersionClaims,
  type ClaimVersionReviewOutcome,
} from "../../../lib/extraction-qa/claim-versions.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import { reviewChunkClaims, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  asExtractionJson,
  clampInt,
  chunkClaimsReviewPasses,
  corsHeaders,
  isEmptyExtraction,
  json,
  resolveClaimsReviewFailureStatus,
  type ClaimsReviewReport,
} from "../../../lib/extraction-qa/types.ts";
import { PipelineDebugTrace } from "../../../lib/pipeline-debug-trace.ts";
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const DEFAULT_MAX = 5;
const STEP_ID = "validate-chunk-claims";
const DEPLOY_NAME = "validate_chunk_claims";
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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    let activePrompt;
    try {
      activePrompt = await loadActivePrompt(supabase, STEP_ID);
      trace.log("load_prompt", "ok", { prompt_version_id: activePrompt.versionId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return traceResponse(trace.fail("load_prompt", msg), { error: msg }, 500);
    }

    const activeResponseSchema = await loadActiveResponseSchema(supabase, STEP_ID);
    trace.log("load_response_schema", "ok", {
      source: activeResponseSchema?.source ?? null,
      schema_name: activeResponseSchema?.schemaName ?? null,
    });

    const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
      p_stage: "validate_claims",
      p_limit: maxChunks * 2,
    });

    if (rpcErr) {
      return traceResponse(trace.fail("fetch_review_queue", rpcErr.message), { error: rpcErr.message }, 500);
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

    trace.log("filter_chunks", chunks.length > 0 ? "ok" : "skip", {
      queue_count: Array.isArray(rows) ? rows.length : 0,
      after_filter: chunks.length,
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
          meta: { message: "No chunks ready for claims review", debug_trace },
        });
      }
      return json({
        ok: true,
        processed: 0,
        message: "No chunks ready for claims review",
        debug_trace,
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }

    if (!dryRun) {
      try {
        const { data: runData } = await supabase
          .from("pipeline_runs")
          .insert({
            pipeline_name: "validate_chunk_claims",
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
    }

    let processed = 0;
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    const requestId = `review-claims-${Date.now()}`;
    const now = new Date().toISOString();

    for (const chunk of chunks) {
      const chunkTrace = new PipelineDebugTrace(`${DEPLOY_NAME}:chunk-${chunk.chunk_index}`);
      chunkTrace.log("chunk_start", "ok", {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
      });

      try {
        const sourceText = chunk.content ?? "";
        const activeVersion = await getActiveClaimVersion(
          supabase,
          chunk.story_id,
          chunk.chunk_index
        );
        const extractionRaw = asExtractionJson(
          activeVersion?.claims_json ?? chunk.extraction_json
        );
        const reviewedClaimVersionId = activeVersion?.id ?? null;
        const claimsWithIds = await ensureStableClaimIds(
          (Array.isArray(extractionRaw.claims) ? extractionRaw.claims : []) as Array<
            Record<string, unknown>
          >,
          chunk.story_id,
          chunk.chunk_index
        );
        const extraction = { ...extractionRaw, claims: claimsWithIds };
        const backfilledClaimIds = (Array.isArray(extractionRaw.claims) ? extractionRaw.claims : []).some(
          (claim) =>
            claim == null ||
            typeof claim !== "object" ||
            typeof (claim as Record<string, unknown>).claim_id !== "string"
        );
        const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

        const { data: chunkMeta } = await supabase
          .from("story_chunks")
          .select("extraction_qa_validation_attempt_count")
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index)
          .single();

        const priorAttempts = chunkMeta?.extraction_qa_validation_attempt_count ?? 0;
        const attemptNumber = priorAttempts + 1;
        const materialityWarnings = getMaterialityWarnings(sourceText, extraction, { claimsOnly: true });

        let reviewReport: ClaimsReviewReport;

        if (isEmptyExtraction(extraction)) {
          const auto = autoPassEmptyExtraction(sourceText.length);
          if (auto.passes) {
            reviewReport = {
              issues: [],
              patches: [],
              recommended_action: "validate",
              passes_review: true,
              summary: "Empty extraction on trivial chunk — auto-passed.",
              deterministic_issues: auto.deterministic_issues,
            };
          } else {
            reviewReport = buildDeterministicClaimsReviewReport(
              {
                passes: false,
                blocking_issues: (auto.blocking_issues ?? []).map((i) =>
                  typeof i === "string" ? i : i.description
                ),
                issues: auto.deterministic_issues ?? [],
                deterministic_checks: auto.deterministic_checks ?? {
                  all_evidence_excerpts_verbatim: true,
                  all_provenance_excerpts_verbatim: true,
                  all_link_indexes_valid: true,
                  unsupported_dates_detected: [],
                  unsupported_locations_detected: [],
                  span_mismatches: [],
                  orphan_evidence_indexes: [],
                  orphan_claim_indexes: [],
                  orphan_event_indexes: [],
                },
              },
              attemptNumber
            );
          }
        } else {
          const strictPre = runStrictPreValidation(sourceText, extraction, {
            claimsOnly: true,
            atomsOnly: true,
          });

          if (!strictPre.passes) {
            reviewReport = buildDeterministicClaimsReviewReport(strictPre, attemptNumber);
          } else {
            reviewReport = await reviewChunkClaims(
              OPENAI_API_KEY,
              MODEL,
              activePrompt.systemPrompt,
              {
                ...metadataPayload(metadata),
                chunk_text: sourceText,
                extraction_json: extraction,
                deterministic_issues: strictPre.issues,
                materiality_warnings: materialityWarnings,
                attempt_number: attemptNumber,
              },
              `${requestId}-${chunk.story_id}-${chunk.chunk_index}`,
              activeResponseSchema
                ? {
                    schema: activeResponseSchema.schema,
                    schemaName: activeResponseSchema.schemaName,
                    normalize: activeResponseSchema.source === "code_default",
                  }
                : undefined,
              OPENAI_TIMEOUT_MS
            );
            reviewReport.deterministic_issues = strictPre.issues;
            reviewReport = mergeAttributionDriftIntoClaimsReview(
              reviewReport,
              strictPre.attribution_issues ?? []
            );
          }
        }

        chunkTrace.log("review_complete", "ok", {
          passes: chunkClaimsReviewPasses(reviewReport),
          recommended_action: reviewReport.recommended_action,
        });

        let finalStatus: string;
        let nextAttemptCount = priorAttempts;
        let validatedAt: string | null = null;

        if (chunkClaimsReviewPasses(reviewReport)) {
          finalStatus = "passed";
          validatedAt = now;
        } else {
          nextAttemptCount = attemptNumber;
          finalStatus = resolveClaimsReviewFailureStatus(
            attemptNumber,
            reviewReport.recommended_action,
            reviewReport
          );
          if (finalStatus === "needs_human_review") {
            validatedAt = now;
          }
        }

        reviewReport.attempt_number = attemptNumber;
        if (reviewedClaimVersionId) {
          reviewReport.reviewed_claim_version_id = reviewedClaimVersionId;
        }

        const versionReviewOutcome: ClaimVersionReviewOutcome | null = chunkClaimsReviewPasses(reviewReport)
          ? "passed"
          : finalStatus === "needs_refinement"
            ? "needs_refinement"
            : finalStatus === "needs_human_review"
              ? "needs_human_review"
              : null;

        if (!dryRun) {
          if (backfilledClaimIds && reviewedClaimVersionId) {
            await updateClaimVersionClaims(supabase, reviewedClaimVersionId, extraction);
          }

          const { data: savedArtifact, error: artifactErr } = await saveArtifact(supabase, {
            story_id: chunk.story_id,
            chunk_index: chunk.chunk_index,
            stage: "chunk_review_claims",
            input_snapshot: extraction,
            report: reviewReport,
            run_id: runId,
            claim_version_id: reviewedClaimVersionId,
          });

          if (artifactErr) {
            chunkTrace.log("save_review_artifact", "fail", {
              claim_version_id: reviewedClaimVersionId,
            }, artifactErr.message);
            lastChunkTrace = chunkTrace.finish();
            const debug_trace = trace.finish();
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
            return json({
              error: artifactErr.message,
              error_code: "review_artifact_save_failed",
              story_id: chunk.story_id,
              chunk_index: chunk.chunk_index,
              debug_trace,
              chunk_debug_trace: lastChunkTrace,
            }, 500);
          }
          chunkTrace.log("save_review_artifact", "ok", {
            claim_version_id: reviewedClaimVersionId,
          });

          const chunkUpdate: Record<string, unknown> = {
            extraction_qa_status: finalStatus,
            extraction_qa_review_report: reviewReport,
            extraction_qa_validation_report: {
              passes: finalStatus === "passed",
              recommended_status: finalStatus,
              summary: reviewReport.summary,
              attempt_number: attemptNumber,
              deterministic_issues: reviewReport.deterministic_issues,
            },
            extraction_qa_validation_attempt_count: nextAttemptCount,
            extraction_qa_validated_at: validatedAt,
          };

          if (backfilledClaimIds && reviewedClaimVersionId) {
            chunkUpdate.extraction_json = extraction;
            chunkUpdate.active_claim_version_id = reviewedClaimVersionId;
          } else if (backfilledClaimIds) {
            chunkUpdate.extraction_json = extraction;
          }

          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update(chunkUpdate)
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index);

          if (updateErr) {
            if (savedArtifact?.id) {
              await supabase
                .from("story_extraction_qa_artifacts")
                .update({ reverted_at: new Date().toISOString() })
                .eq("id", savedArtifact.id);
            }
            chunkTrace.log("update_chunk_row", "fail", {
              rolled_back_artifact: Boolean(savedArtifact?.id),
            }, updateErr.message);
            lastChunkTrace = chunkTrace.finish();
            const debug_trace = trace.finish();
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
            return json({
              error: updateErr.message,
              error_code: "chunk_update_failed",
              story_id: chunk.story_id,
              chunk_index: chunk.chunk_index,
              debug_trace,
              chunk_debug_trace: lastChunkTrace,
            }, 500);
          }
          chunkTrace.log("update_chunk_row", "ok", {
            extraction_qa_status: finalStatus,
          });

          if (reviewedClaimVersionId && versionReviewOutcome) {
            await setClaimVersionReviewOutcome(
              supabase,
              reviewedClaimVersionId,
              versionReviewOutcome
            );
          }
        } else {
          chunkTrace.log("persist_results", "skip", { dry_run: true });
        }

        lastChunkTrace = chunkTrace.finish();
        trace.log("process_chunk", "ok", {
          chunk_index: chunk.chunk_index,
          final_status: finalStatus,
        });
        processed += 1;
        processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        chunkTrace.log("chunk_unhandled_error", "fail", undefined, msg);
        lastChunkTrace = chunkTrace.finish();
        const debug_trace = trace.finish();
        console.error("[validate_chunk_claims] Error:", chunk.story_id, chunk.chunk_index, msg);
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
        debugTrace: lastChunkTrace ?? debug_trace,
      });
    }

    if (!dryRun && runId) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          counts: { chunks: processed, debug_trace },
        })
        .eq("run_id", runId);
    }

    return json({
      ok: true,
      processed,
      dry_run: dryRun,
      model: MODEL,
      run_id: runId,
      prompt_version_number: activePrompt.versionNumber,
      response_schema_source: activeResponseSchema?.source ?? null,
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
