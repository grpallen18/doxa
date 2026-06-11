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
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const DEFAULT_MAX = 5;
const STEP_ID = "validate-chunk-claims";
const DEPLOY_NAME = "validate_chunk_claims";

export const handler = async (req: Request) => {
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
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch {
    /* defaults */
  }

  const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
  if (invalidStoryId) return json({ error: invalidUuidMessage("story_id") }, 400);

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }

  const activeResponseSchema = await loadActiveResponseSchema(supabase, STEP_ID);

  const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
    p_stage: "validate_claims",
    p_limit: maxChunks * 2,
  });

  if (rpcErr) return json({ error: rpcErr.message }, 500);

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
        meta: { message: "No chunks ready for claims review" },
      });
    }
    return json({
      ok: true,
      processed: 0,
      message: "No chunks ready for claims review",
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  let runId: string | null = null;
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
    } catch {
      /* continue */
    }
  }

  let processed = 0;
  const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
  const requestId = `review-claims-${Date.now()}`;
  const now = new Date().toISOString();

  for (const chunk of chunks) {
    try {
      const sourceText = chunk.content ?? "";
      const extractionRaw = asExtractionJson(chunk.extraction_json);
      const claimsWithIds = await ensureStableClaimIds(
        (Array.isArray(extractionRaw.claims) ? extractionRaw.claims : []) as Array<Record<string, unknown>>,
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
              : undefined
          );
          reviewReport.deterministic_issues = strictPre.issues;
          reviewReport = mergeAttributionDriftIntoClaimsReview(
            reviewReport,
            strictPre.attribution_issues ?? []
          );
        }
      }

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

      if (!dryRun) {
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
        if (backfilledClaimIds) {
          chunkUpdate.extraction_json = extraction;
        }

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update(chunkUpdate)
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) return json({ error: updateErr.message }, 500);

        await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_review_claims",
          input_snapshot: extraction,
          report: reviewReport,
          run_id: runId,
        });
      }

      processed += 1;
      processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[validate_chunk_claims] Error:", chunk.story_id, chunk.chunk_index, msg);
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
    dry_run: dryRun,
    model: MODEL,
    run_id: runId,
    prompt_version_number: activePrompt.versionNumber,
    response_schema_source: activeResponseSchema?.source ?? null,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
