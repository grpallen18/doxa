// Validate chunk extraction: deterministic pre-validator + LLM judge; sets atoms_passed or refine loop.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }
// Optional env: OPENAI_MODEL_CHUNK_QA (falls back to OPENAI_MODEL_EXTRACT, OPENAI_MODEL).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  autoPassEmptyExtraction,
  buildDeterministicValidationReport,
  getMaterialityWarnings,
  runStrictPreValidation,
} from "../../../lib/extraction-qa/deterministic-checks.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import { saveArtifact, validateChunk } from "../../../lib/extraction-qa/openai-qa.ts";
import { applyProvenanceSpans } from "../../../lib/extraction-qa/span-compute.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  asExtractionJson,
  clampInt,
  corsHeaders,
  isEmptyExtraction,
  json,
  MAX_VALIDATION_ATTEMPTS,
  resolveValidationFailureStatus,
  type ValidationReport,
} from "../../../lib/extraction-qa/types.ts";

const DEFAULT_MAX = 5;

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

  const { data: rows, error: rpcErr } = await supabase.rpc("get_chunks_ready_for_chunk_qa", {
    p_stage: "validate",
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
    return json({ ok: true, processed: 0, message: "No chunks ready for validate", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  for (const chunk of chunks) {
    try {
      const sourceText = chunk.content ?? "";
      const extraction = applyProvenanceSpans(asExtractionJson(chunk.extraction_json), sourceText);
      const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

      const { data: chunkMeta } = await supabase
        .from("story_chunks")
        .select(
          "extraction_qa_standardization_report, extraction_qa_validation_attempt_count, extraction_qa_refinement_count"
        )
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index)
        .single();

      const priorAttempts = chunkMeta?.extraction_qa_validation_attempt_count ?? 0;
      const attemptNumber = priorAttempts + 1;
      const materialityWarnings = getMaterialityWarnings(sourceText, extraction);

      let validationReport: ValidationReport;

      if (isEmptyExtraction(extraction)) {
        validationReport = autoPassEmptyExtraction(sourceText.length);
      } else {
        const strictPre = runStrictPreValidation(sourceText, extraction, {
          enforceCompleteness: false,
          atomsOnly: true,
        });

        if (!strictPre.passes) {
          validationReport = buildDeterministicValidationReport(
            strictPre,
            [],
            false,
            attemptNumber >= MAX_VALIDATION_ATTEMPTS ? "needs_human_review" : "needs_refinement"
          );
        } else {
          validationReport = await validateChunk(
            OPENAI_API_KEY,
            MODEL,
            {
              ...metadataPayload(metadata),
              chunk_text: sourceText,
              source_text: sourceText,
              extraction_json: extraction,
              standardization_report: chunkMeta?.extraction_qa_standardization_report ?? null,
              deterministic_issues: strictPre.issues,
              materiality_warnings: materialityWarnings,
              attempt_number: attemptNumber,
            },
            `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
          );
          validationReport.deterministic_issues = strictPre.issues;
          validationReport.deterministic_checks = strictPre.deterministic_checks;
          validationReport.materiality_warnings = materialityWarnings;
          validationReport.attempt_number = attemptNumber;
        }
      }

      let finalStatus: string;
      let nextAttemptCount = priorAttempts;
      let validatedAt: string | null = null;

      if (validationReport.passes || validationReport.recommended_status === "passed" || validationReport.recommended_status === "atoms_passed") {
        finalStatus = "atoms_passed";
        validatedAt = now;
      } else {
        nextAttemptCount = attemptNumber;
        finalStatus = resolveValidationFailureStatus(nextAttemptCount, validationReport.recommended_status);
        validationReport.recommended_status = finalStatus;
        if (finalStatus === "needs_refinement") {
          validationReport.recommended_next_agent = "refiner";
        } else if (finalStatus === "needs_human_review") {
          validationReport.recommended_next_agent = "human_review";
          validatedAt = now;
        }
      }

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: extraction,
            extraction_qa_status: finalStatus,
            extraction_qa_validation_report: validationReport,
            extraction_qa_validation_attempt_count: nextAttemptCount,
            extraction_qa_validated_at: validatedAt,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          console.error("[validate_chunk_extraction] Update error:", updateErr.message);
          return json(
            { error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index },
            500
          );
        }

        const { error: artifactErr } = await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_validate",
          input_snapshot: extraction,
          report: validationReport,
        });
        if (artifactErr) {
          return json(
            { error: artifactErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index },
            500
          );
        }
      }
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[validate_chunk_extraction] Error:", chunk.story_id, chunk.chunk_index, msg);
      return json({ error: msg, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
    }
  }

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
