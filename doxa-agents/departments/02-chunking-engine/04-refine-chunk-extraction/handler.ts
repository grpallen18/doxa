// Refine chunk extraction: apply reviewer patches (max one cycle).
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { applyPatches } from "../../../lib/extraction-qa/apply-patches.ts";
import { refineChunk, saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import {
  asExtractionJson,
  clampInt,
  corsHeaders,
  json,
  type RefinementPatchOp,
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
    return json({ ok: true, processed: 0, message: "No chunks ready for refine", ...testScopeFields({ storyId: singleStoryId }) });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();

  for (const chunk of chunks) {
    const { data: meta } = await supabase
      .from("story_chunks")
      .select("extraction_qa_review_report, extraction_qa_refinement_count")
      .eq("story_id", chunk.story_id)
      .eq("chunk_index", chunk.chunk_index)
      .single();

    const extraction = asExtractionJson(chunk.extraction_json);
    const reviewReport = meta?.extraction_qa_review_report ?? {};

    const { patches } = await refineChunk(
      OPENAI_API_KEY,
      MODEL,
      {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
        source_text: chunk.content ?? "",
        extraction_json: extraction,
        review_report: reviewReport,
      },
      `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
    );

    const normalizedPatches: RefinementPatchOp[] = (patches ?? [])
      .filter((p) => p && p.op && p.entity_type)
      .map((p) => ({
        op: p.op as "add" | "remove" | "update",
        entity_type: p.entity_type,
        entity_index: p.entity_index ?? 0,
        ...(p.op === "add" || p.op === "update"
          ? { value: (p.value ?? {}) as Record<string, unknown> }
          : {}),
      })) as RefinementPatchOp[];

    const patched = applyPatches(extraction, normalizedPatches);
    const refinementCount = (meta?.extraction_qa_refinement_count ?? 0) + 1;

    if (!dryRun) {
      await supabase
        .from("story_chunks")
        .update({
          extraction_json: patched,
          extraction_qa_status: "refined",
          extraction_qa_refinement_count: refinementCount,
        })
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index);

      await saveArtifact(supabase, {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
        stage: "chunk_refine",
        input_snapshot: extraction,
        output_snapshot: patched,
        report: { patches: normalizedPatches },
      });
    }
    processed++;
  }

  return json({ ok: true, processed, dry_run: dryRun, ...testScopeFields({ storyId: singleStoryId }) });
};
