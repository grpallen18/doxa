// Validate merged story extraction before canonicalization.
// Body: { max_stories?, dry_run?, story_id? }

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
import { loadChunkBlobsUnion, loadMergedExtractionJson } from "../../../lib/extraction-qa/merge-payload.ts";
import { saveArtifact, validateMerged } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  clampInt,
  corsHeaders,
  isEmptyExtraction,
  isClaimsOnlyExtraction,
  json,
  type ReviewReport,
} from "../../../lib/extraction-qa/types.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX = 1;

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

  const maxStories = clampInt(body.max_stories, 1, 10, DEFAULT_MAX);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: storyIds, error: rpcErr } = await supabase.rpc("get_stories_ready_for_merge_qa", {
    p_stage: "validate",
    p_limit: maxStories,
  });

  if (rpcErr) return json({ error: rpcErr.message }, 500);

  let stories = (storyIds ?? []) as Array<{ story_id: string }>;
  if (singleStoryId) stories = stories.filter((s) => s.story_id === singleStoryId);

  if (stories.length === 0) {
    return json({ ok: true, processed: 0, message: "No stories ready for merge validate", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  for (const { story_id: storyId } of stories) {
    const { articleText, extraction } = await loadMergedExtractionJson(supabase, storyId);
    const chunkUnion = await loadChunkBlobsUnion(supabase, storyId);
    const sourceText = articleText.slice(0, 12000);
    const metadata = await loadStoryMetadata(supabase, storyId);

    const { data: storyMeta } = await supabase
      .from("stories")
      .select("extraction_qa_review_report, extraction_qa_refinement_count")
      .eq("story_id", storyId)
      .single();

    const reviewReport = (storyMeta?.extraction_qa_review_report ?? null) as ReviewReport | null;

    let validationReport;

    if (isEmptyExtraction(extraction)) {
      validationReport = autoPassEmptyExtraction(sourceText.length);
    } else {
      const claimsOnly = isClaimsOnlyExtraction(extraction);
      const strictPre = runStrictPreValidation(sourceText, extraction, {
        enforceCompleteness: !claimsOnly,
        claimsOnly,
        atomsOnly: true,
      });
      const refinerUnresolved =
        storyMeta?.extraction_qa_refinement_count && storyMeta.extraction_qa_refinement_count > 0
          ? checkBlockingFindingsUnresolved(reviewReport, extraction, extraction, sourceText)
          : [];

      if (!strictPre.passes || refinerUnresolved.length > 0) {
        validationReport = buildDeterministicValidationReport(strictPre, refinerUnresolved, true);
      } else {
        validationReport = await validateMerged(
          OPENAI_API_KEY,
          MODEL,
          {
            ...metadataPayload(metadata),
            article_text: sourceText,
            source_text: sourceText,
            merged_extraction: extraction,
            extraction_json: extraction,
            chunk_union: chunkUnion,
            review_report: reviewReport,
            deterministic_issues: strictPre.issues,
          },
          `${requestId}-${storyId}`
        );
        validationReport.deterministic_issues = strictPre.issues;
        validationReport.deterministic_checks = strictPre.deterministic_checks;
        if (validationReport.scores.merge_fidelity === undefined) {
          validationReport.scores.merge_fidelity = 0.8;
        }
      }
    }

    const finalStatus = validationReport.passes
      ? "passed"
      : validationReport.recommended_status === "needs_refinement"
        ? "needs_human_review"
        : validationReport.recommended_status;

    if (!dryRun) {
      await supabase
        .from("stories")
        .update({
          extraction_qa_status: finalStatus,
          extraction_qa_validation_report: validationReport,
          extraction_qa_validated_at: now,
        })
        .eq("story_id", storyId);

      await saveArtifact(supabase, {
        story_id: storyId,
        stage: "merge_validate",
        input_snapshot: extraction,
        report: validationReport,
      });
    }
    processed++;
  }

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
