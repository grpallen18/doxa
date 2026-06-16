// Repair claims in repair_queue only (full JSON replacement). Sets awaiting_approval.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { loadActiveResponseSchema } from "../../../lib/agent-response-schema.ts";
import {
  buildRepairPayload,
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
import { asExtractionJson, clampInt, corsHeaders, json } from "../../../lib/extraction-qa/types.ts";
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
      p_stage: "refine",
      p_limit: maxChunks * 2,
    });
    if (rpcErr) {
      return traceResponse(trace.fail("fetch_refine_queue", rpcErr.message), { error: rpcErr.message }, 500);
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
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    const requestId = `refine-claims-${Date.now()}`;

    for (const chunk of chunks) {
      const chunkTrace = new PipelineDebugTrace(`${DEPLOY_NAME}:chunk-${chunk.chunk_index}`);
      try {
        const sourceText = chunk.content ?? "";
        const mergeState = await loadClaimsMergeEligibility(supabase, chunk.story_id, chunk.chunk_index);
        const queueIds = repairQueueClaimIds(mergeState);
        if (queueIds.length === 0) {
          chunkTrace.log("repair_queue", "skip", { reason: "empty_queue" });
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

        const normalized = await normalizeChunkClaims(
          llmResult.claims,
          chunk.story_id,
          chunk.chunk_index,
          sourceText,
          { refinementCycle: nextRefinementCount, preserveClaimIds: true }
        );

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
        lastChunkTrace = chunkTrace.finish();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastChunkTrace = chunkTrace.finish();
        await recordStoryStepRun(supabase, {
          storyId: chunk.story_id,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "failure",
          trigger: resolveStoryStepTrigger(singleStoryId),
          pipelineRunId: runId,
          chunkIndex: chunk.chunk_index,
          error: msg,
          meta: { debug_trace: lastChunkTrace },
        });
        return traceResponse(trace.fail("process_chunk", msg), {
          error: msg,
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          chunk_debug_trace: lastChunkTrace,
        }, 500);
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
