// Review merged story extraction.
// Body: { max_stories?, dry_run?, story_id? }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { runDeterministicChecks } from "../../../lib/extraction-qa/deterministic-checks.ts";
import { loadChunkBlobsUnion, loadMergedExtractionJson } from "../../../lib/extraction-qa/merge-payload.ts";
import { reviewMerged, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import {
  clampInt,
  corsHeaders,
  isEmptyExtraction,
  json,
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
    p_stage: "review",
    p_limit: maxStories,
  });

  if (rpcErr) return json({ error: rpcErr.message }, 500);

  let stories = (storyIds ?? []) as Array<{ story_id: string }>;
  if (singleStoryId) stories = stories.filter((s) => s.story_id === singleStoryId);

  if (stories.length === 0) {
    return json({ ok: true, processed: 0, message: "No stories ready for merge review", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();

  for (const { story_id: storyId } of stories) {
    const { articleText, extraction } = await loadMergedExtractionJson(supabase, storyId);
    const chunkUnion = await loadChunkBlobsUnion(supabase, storyId);
    const det = runDeterministicChecks(articleText, extraction);

    if (isEmptyExtraction(extraction)) {
      if (!dryRun) {
        await supabase
          .from("stories")
          .update({
            extraction_qa_status: "reviewed",
            extraction_qa_review_report: { findings: [], recommended_action: "validate", deterministic_issues: det.issues },
          })
          .eq("story_id", storyId);
      }
      processed++;
      continue;
    }

    const llmReport = await reviewMerged(
      OPENAI_API_KEY,
      MODEL,
      {
        story_id: storyId,
        article_text: articleText.slice(0, 12000),
        merged_extraction: extraction,
        chunk_union_summary: {
          claim_count: chunkUnion.claims?.length ?? 0,
          position_count: chunkUnion.positions?.length ?? 0,
        },
        deterministic_issues: det.issues,
      },
      `${requestId}-${storyId}`
    );

    const report = { ...llmReport, deterministic_issues: det.issues };
    const blocking = report.findings.filter((f) => f.severity === "blocking");
    let nextStatus: string;
    if (report.recommended_action === "human_review") {
      nextStatus = "needs_human_review";
    } else if (blocking.length > 0 || report.recommended_action === "refine") {
      nextStatus = "needs_refinement";
    } else {
      nextStatus = "reviewed";
    }

    if (!dryRun) {
      await supabase
        .from("stories")
        .update({ extraction_qa_status: nextStatus, extraction_qa_review_report: report })
        .eq("story_id", storyId);

      await saveArtifact(supabase, {
        story_id: storyId,
        stage: "merge_review",
        input_snapshot: extraction,
        report,
      });
    }
    processed++;
  }

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
