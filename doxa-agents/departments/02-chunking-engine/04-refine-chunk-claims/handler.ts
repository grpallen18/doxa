// Refine claims-only chunk extraction from review findings (max three cycles).
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }
// Optional env: OPENAI_MODEL_CHUNK_QA (falls back to OPENAI_MODEL_EXTRACT, OPENAI_MODEL).

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadActivePrompt } from "../../../lib/agent-prompts.ts";
import { ensureStableClaimIds } from "../../../lib/extraction-qa/claim-ids.ts";
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
import {
  logBatchChunkStepRuns,
  recordStoryStepRun,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "refine-chunk-claims";
const DEPLOY_NAME = "refine_chunk_claims";

const DEFAULT_MAX = 5;

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

export const handler = async (req: Request) => {
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
      return json({ error: "Missing env" }, 500);
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

    const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
      p_stage: "refine",
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
          meta: { message: "No chunks ready for claims refine" },
        });
      }
      return json({
        ok: true,
        processed: 0,
        message: "No chunks ready for claims refine",
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }

    let runId: string | null = null;
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
      } catch {
        /* continue */
      }
    }

    let processed = 0;
    const processedChunks: Array<{ story_id: string; chunk_index: number }> = [];
    const requestId = `refine-claims-${Date.now()}`;

    for (const chunk of chunks) {
      const { data: meta } = await supabase
        .from("story_chunks")
        .select("extraction_qa_review_report, extraction_qa_refinement_count")
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index)
        .single();

      const refinementCount = meta?.extraction_qa_refinement_count ?? 0;
      if (refinementCount >= MAX_REFINEMENT_ATTEMPTS) {
        continue;
      }

      const extraction = asExtractionJson(chunk.extraction_json);
      const reviewReport = (meta?.extraction_qa_review_report ?? {}) as ClaimsReviewReport;
      const sourceText = chunk.content ?? "";
      const storyMetadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

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
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

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

      if (!dryRun) {
        const nextStatus = gateFailed ? "needs_human_review" : "pending";

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: patched,
            extraction_qa_status: nextStatus,
            extraction_qa_refinement_count: nextRefinementCount,
            extraction_qa_validated_at: null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) return json({ error: updateErr.message }, 500);

        await saveArtifact(supabase, {
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
          },
          run_id: runId,
        });
      }

      processed += 1;
      processedChunks.push({ story_id: chunk.story_id, chunk_index: chunk.chunk_index });
    }

    if (processed === 0 && !dryRun) {
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
          meta: { message: "No chunks refined this invoke" },
        });
      }
    } else {
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

    return json({
      ok: true,
      processed,
      dry_run: dryRun,
      model: MODEL,
      run_id: runId,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
};

