// Review chunk extraction: deterministic pre-check + LLM completeness reviewer.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { runDeterministicChecks, getCompletenessIssues } from "../../../lib/extraction-qa/deterministic-checks.ts";
import { reviewChunk, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  asExtractionJson,
  clampInt,
  isEmptyExtraction,
  isBlockingSeverity,
  isFixableSeverity,
  json,
  corsHeaders,
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
    p_stage: "review",
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
    return json({ ok: true, processed: 0, message: "No chunks ready for review", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();

  for (const chunk of chunks) {
    try {
      const extraction = asExtractionJson(chunk.extraction_json);
      const sourceText = chunk.content ?? "";
      const det = runDeterministicChecks(sourceText, extraction, { atomsOnly: true });
      const completenessIssues = getCompletenessIssues(extraction);
      const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

      if (isEmptyExtraction(extraction)) {
        if (!dryRun) {
          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update({
              extraction_qa_status: "reviewed",
              extraction_qa_review_report: { findings: [], recommended_action: "validate", deterministic_issues: det.issues },
            })
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index);
          if (updateErr) {
            return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
          }
        }
        processed++;
        continue;
      }

      const llmReport = await reviewChunk(
        OPENAI_API_KEY,
        MODEL,
        {
          ...metadataPayload(metadata),
          chunk_text: sourceText,
          source_text: sourceText,
          extraction_json: extraction,
          deterministic_issues: det.issues,
          completeness_issues: completenessIssues,
        },
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      const report = {
        ...llmReport,
        deterministic_issues: det.issues,
        completeness_issues: completenessIssues,
      };

      const programmaticFindings = completenessIssues.map((issue) => ({
        type: issue.startsWith("missing_position")
          ? "missing_position"
          : issue.startsWith("missing_event")
            ? "missing_event"
            : "missing_claim",
        severity: "minor" as const,
        description: issue,
        entity_type: null,
        entity_index: null,
        link_type: null,
        unsupported_text: null,
        source_excerpt: null,
        recommended_patch: { op: "none" as const, entity_type: null, entity_index: null, replacement_text: null, new_entity: null, link: null },
      }));

      report.findings = [...programmaticFindings, ...(report.findings ?? [])];

      const blocking = report.findings.filter((f) => isBlockingSeverity(f.severity));
      const fixable = report.findings.filter((f) => isFixableSeverity(f.severity));
      let nextStatus: string;
      if (report.recommended_action === "human_review") {
        nextStatus = "needs_human_review";
      } else if (blocking.length > 0 || fixable.length > 0 || report.recommended_action === "refine") {
        nextStatus = "needs_refinement";
      } else {
        nextStatus = "reviewed";
      }

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_qa_status: nextStatus,
            extraction_qa_review_report: report,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }

        const { error: artifactErr } = await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_review",
          input_snapshot: extraction,
          report,
        });
        if (artifactErr) {
          return json({ error: artifactErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }
      }
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[review_chunk_extraction] Error:", chunk.story_id, chunk.chunk_index, msg);
      return json({ error: msg, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
    }
  }

  return json({
    ok: true,
    processed,
    dry_run: dryRun,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
