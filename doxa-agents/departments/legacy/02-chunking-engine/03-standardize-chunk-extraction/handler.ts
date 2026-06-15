// Standardize chunk extraction: taxonomy, dedupe, materiality filter on candidate atoms.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }
// Optional env: OPENAI_MODEL_CHUNK_QA (falls back to OPENAI_MODEL_EXTRACT, OPENAI_MODEL).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  attachProvenance,
  normalizeAtomRow,
} from "../../../lib/extraction-qa/atom-schema.ts";
import { resolveChunkQaModel } from "../../../lib/extraction-qa/chunk-qa-model.ts";
import { saveArtifact, standardizeChunk } from "../../../lib/extraction-qa/openai-qa.ts";
import {
  applyProvenanceSpans,
  enforceVerbatimExcerpts,
} from "../../../lib/extraction-qa/span-compute.ts";
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
  isEmptyExtraction,
  json,
} from "../../../lib/extraction-qa/types.ts";

const DEFAULT_MAX = 5;

function normalizeStandardizedExtraction(
  raw: {
    claims?: unknown[];
    evidence?: unknown[];
    positions?: unknown[];
    events?: unknown[];
  },
  storyId: string,
  chunkIndex: number
) {
  const claimsRaw = (Array.isArray(raw?.claims) ? raw.claims : []).map((c) =>
    normalizeAtomRow("claim", c as Record<string, unknown>)
  );
  const evidenceRaw = (Array.isArray(raw?.evidence) ? raw.evidence : []).map((e) =>
    normalizeAtomRow("evidence", e as Record<string, unknown>)
  );
  const positionsRaw = (Array.isArray(raw?.positions) ? raw.positions : []).map((p) =>
    normalizeAtomRow("position", p as Record<string, unknown>)
  );
  const eventsRaw = (Array.isArray(raw?.events) ? raw.events : []).map((e) =>
    normalizeAtomRow("event", e as Record<string, unknown>)
  );

  return {
    claims: attachProvenance(claimsRaw, storyId, chunkIndex),
    evidence: attachProvenance(evidenceRaw, storyId, chunkIndex),
    positions: attachProvenance(positionsRaw, storyId, chunkIndex),
    events: attachProvenance(eventsRaw, storyId, chunkIndex),
  };
}

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
    p_stage: "standardize",
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
    return json({
      ok: true,
      processed: 0,
      message: "No chunks ready for standardize",
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();

  for (const chunk of chunks) {
    try {
      const { data: chunkRow } = await supabase
        .from("story_chunks")
        .select("active_claim_version_id")
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index)
        .maybeSingle();

      if (chunkRow?.active_claim_version_id) {
        continue;
      }

      const sourceText = chunk.content ?? "";
      const candidates = applyProvenanceSpans(asExtractionJson(chunk.extraction_json), sourceText);
      const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);

      if (isEmptyExtraction(candidates)) {
        if (!dryRun) {
          const { error: updateErr } = await supabase
            .from("story_chunks")
            .update({
              extraction_qa_status: "standardized",
              extraction_qa_standardization_report: {
                kept: [],
                merged: [],
                reclassified: [],
                discarded: [],
                notes: ["empty_extraction"],
              },
              extraction_qa_validation_report: null,
              extraction_qa_validation_attempt_count: 0,
              extraction_qa_refinement_count: 0,
              extraction_qa_validated_at: null,
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

      const llmResult = await standardizeChunk(
        OPENAI_API_KEY,
        MODEL,
        {
          ...metadataPayload(metadata),
          chunk_text: sourceText,
          source_text: sourceText,
          candidate_extraction_json: candidates,
        },
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      let standardized = normalizeStandardizedExtraction(
        llmResult,
        chunk.story_id,
        chunk.chunk_index
      );
      const preEnforceCount =
        (standardized.claims?.length ?? 0) +
        (standardized.evidence?.length ?? 0) +
        (standardized.positions?.length ?? 0) +
        (standardized.events?.length ?? 0);
      standardized = enforceVerbatimExcerpts(standardized, sourceText);
      standardized = applyProvenanceSpans(standardized, sourceText);
      const postEnforceCount =
        (standardized.claims?.length ?? 0) +
        (standardized.evidence?.length ?? 0) +
        (standardized.positions?.length ?? 0) +
        (standardized.events?.length ?? 0);

      const standardizationReport = {
        ...(llmResult.standardization_report ?? {
          kept: [],
          merged: [],
          reclassified: [],
          discarded: [],
          notes: [],
        }),
        notes: [...(llmResult.standardization_report?.notes ?? [])],
      };
      if (preEnforceCount > postEnforceCount) {
        standardizationReport.notes.push(
          `deterministic: dropped ${preEnforceCount - postEnforceCount} atom(s) with non-verbatim source_excerpt`
        );
      }

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: standardized,
            extraction_qa_status: "standardized",
            extraction_qa_standardization_report: standardizationReport,
            extraction_qa_validation_report: null,
            extraction_qa_validation_attempt_count: 0,
            extraction_qa_refinement_count: 0,
            extraction_qa_validated_at: null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }

        const { error: artifactErr } = await saveArtifact(supabase, {
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          stage: "chunk_standardize",
          input_snapshot: candidates,
          output_snapshot: standardized,
          report: standardizationReport,
        });
        if (artifactErr) {
          return json({ error: artifactErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }
      }
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[standardize_chunk_extraction] Error:", chunk.story_id, chunk.chunk_index, msg);
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
