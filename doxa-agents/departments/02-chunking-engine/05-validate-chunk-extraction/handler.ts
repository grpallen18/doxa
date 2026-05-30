// Validate chunk extraction: deterministic pre-validator + LLM judge; sets passed or needs_human_review.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import {
  autoPassEmptyExtraction,
  buildDeterministicValidationReport,
  checkBlockingFindingsUnresolved,
  runStrictPreValidation,
} from "../../../lib/extraction-qa/deterministic-checks.ts";
import { saveArtifact, validateChunk } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  asExtractionJson,
  clampInt,
  corsHeaders,
  isEmptyExtraction,
  json,
  type ReviewReport,
} from "../../../lib/extraction-qa/types.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX = 5;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

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
    const extraction = asExtractionJson(chunk.extraction_json);
    const sourceText = chunk.content ?? "";
    const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

    const { data: chunkMeta } = await supabase
      .from("story_chunks")
      .select("extraction_qa_review_report, extraction_qa_refinement_count")
      .eq("story_id", chunk.story_id)
      .eq("chunk_index", chunk.chunk_index)
      .single();

    const reviewReport = (chunkMeta?.extraction_qa_review_report ?? null) as ReviewReport | null;

    let validationReport;

    if (isEmptyExtraction(extraction)) {
      validationReport = autoPassEmptyExtraction(sourceText.length);
    } else {
      const strictPre = runStrictPreValidation(sourceText, extraction, {
        enforceCompleteness: false,
        atomsOnly: true,
      });
      const refinerUnresolved =
        chunkMeta?.extraction_qa_refinement_count && chunkMeta.extraction_qa_refinement_count > 0
          ? checkBlockingFindingsUnresolved(reviewReport, extraction, extraction, sourceText)
          : [];

      if (!strictPre.passes || refinerUnresolved.length > 0) {
        validationReport = buildDeterministicValidationReport(strictPre, refinerUnresolved, false);
      } else {
        validationReport = await validateChunk(
          OPENAI_API_KEY,
          MODEL,
          {
            ...metadataPayload(metadata),
            chunk_text: sourceText,
            source_text: sourceText,
            extraction_json: extraction,
            refined_extraction_json: extraction,
            review_report: reviewReport,
            deterministic_issues: strictPre.issues,
          },
          `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
        );
        validationReport.deterministic_issues = strictPre.issues;
        validationReport.deterministic_checks = strictPre.deterministic_checks;
      }
    }

    const finalStatus = validationReport.passes
      ? "atoms_passed"
      : validationReport.recommended_status === "needs_refinement"
        ? "needs_refinement"
        : validationReport.recommended_status === "passed"
          ? "atoms_passed"
          : validationReport.recommended_status;

    if (!dryRun) {
      await supabase
        .from("story_chunks")
        .update({
          extraction_qa_status: finalStatus,
          extraction_qa_validation_report: validationReport,
          extraction_qa_validated_at: now,
        })
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index);

      await saveArtifact(supabase, {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
        stage: "chunk_validate",
        input_snapshot: extraction,
        report: validationReport,
      });
    }
    processed++;
  }

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
