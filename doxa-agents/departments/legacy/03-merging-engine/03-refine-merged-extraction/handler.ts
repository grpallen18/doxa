// Refine merged story extraction (max one cycle).
// Body: { max_stories?, dry_run?, story_id? }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { applyPatches } from "../../../lib/extraction-qa/apply-patches.ts";
import {
  checkBlockingFindingsUnresolved,
  runStrictPreValidation,
} from "../../../lib/extraction-qa/deterministic-checks.ts";
import { loadMergedExtractionJson } from "../../../lib/extraction-qa/merge-payload.ts";
import { persistMergedExtraction } from "../../../lib/extraction-qa/persist-merged-extraction.ts";
import { refineMerged, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  clampInt,
  corsHeaders,
  isClaimsOnlyExtraction,
  json,
  type RefinementPatchOp,
  type ReviewReport,
} from "../../../lib/extraction-qa/types.ts";
import { logMergeQaStoryRuns, recordStoryStepRun, resolveStoryStepTrigger } from "../../../lib/story-step-runs.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX = 1;
const STEP_ID = "refine-merged-extraction";
const DEPLOY_NAME = "refine_merged_extraction";

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
    p_stage: "refine",
    p_limit: maxStories,
  });

  if (rpcErr) return json({ error: rpcErr.message }, 500);

  let stories = (storyIds ?? []) as Array<{ story_id: string }>;
  if (singleStoryId) stories = stories.filter((s) => s.story_id === singleStoryId);

  if (stories.length === 0) {
    if (!dryRun && singleStoryId) {
      await recordStoryStepRun(supabase, {
        storyId: singleStoryId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "no_op",
        trigger: resolveStoryStepTrigger(singleStoryId),
        meta: { message: "No stories ready for merge refine" },
      });
    }
    return json({ ok: true, processed: 0, message: "No stories ready for merge refine", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const processedStoryIds: string[] = [];
  const requestId = crypto.randomUUID();

  for (const { story_id: storyId } of stories) {
    const { articleText, extraction } = await loadMergedExtractionJson(supabase, storyId);
    const { data: meta } = await supabase
      .from("stories")
      .select("extraction_qa_review_report, extraction_qa_refinement_count")
      .eq("story_id", storyId)
      .single();

    const reviewReport = (meta?.extraction_qa_review_report ?? {}) as ReviewReport;
    const metadata = await loadStoryMetadata(supabase, storyId);
    const sourceText = articleText.slice(0, 12000);

    const refineResult = await refineMerged(
      OPENAI_API_KEY,
      MODEL,
      {
        ...metadataPayload(metadata),
        article_text: sourceText,
        source_text: sourceText,
        extraction_json: extraction,
        original_extraction_json: extraction,
        review_report: reviewReport,
      },
      `${requestId}-${storyId}`
    );

    const { patches, ignored_findings } = refineResult;

    const normalizedPatches: RefinementPatchOp[] = (patches ?? [])
      .filter((p) => p && p.op && p.entity_type)
      .map((p) => ({
        op: p.op as RefinementPatchOp["op"],
        entity_type: p.entity_type,
        entity_index: p.entity_index ?? 0,
        ...(p.op === "add" || p.op === "update" || p.op === "link"
          ? { value: (p.value ?? {}) as Record<string, unknown> }
          : p.op === "unlink" && p.value
            ? { value: p.value as Record<string, unknown> }
            : {}),
      })) as RefinementPatchOp[];

    const patched = applyPatches(extraction, normalizedPatches);
    const claimsOnly = isClaimsOnlyExtraction(extraction);
    const postRefineGate = runStrictPreValidation(sourceText, patched, {
      enforceCompleteness: !claimsOnly,
      claimsOnly,
    });
    const refinerUnresolved = checkBlockingFindingsUnresolved(
      reviewReport,
      extraction,
      patched,
      sourceText
    );
    const gateFailed = !postRefineGate.passes || refinerUnresolved.length > 0;
    const refinementCount = (meta?.extraction_qa_refinement_count ?? 0) + 1;

    if (!dryRun) {
      await persistMergedExtraction(supabase, storyId, patched, null);
      await supabase
        .from("stories")
        .update({
          extraction_qa_status: gateFailed ? "needs_human_review" : "refined",
          extraction_qa_refinement_count: refinementCount,
        })
        .eq("story_id", storyId);

      await saveArtifact(supabase, {
        story_id: storyId,
        stage: "merge_refine",
        input_snapshot: extraction,
        output_snapshot: patched,
        report: {
          patches: normalizedPatches,
          ignored_findings: ignored_findings ?? [],
          post_refine_gate: {
            strict_pre_validation: postRefineGate,
            refiner_unresolved: refinerUnresolved,
            gate_failed: gateFailed,
          },
        },
      });
    }
    processed++;
    processedStoryIds.push(storyId);
  }

  await logMergeQaStoryRuns(supabase, {
    stepId: STEP_ID,
    deployName: DEPLOY_NAME,
    trigger: resolveStoryStepTrigger(singleStoryId),
    storyIds: processedStoryIds,
    dryRun,
    modelName: MODEL,
  });

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
