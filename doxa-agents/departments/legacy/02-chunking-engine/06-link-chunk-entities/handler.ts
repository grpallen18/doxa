// Link chunk entities: add semantic relationship arrays after atoms_passed validation.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { hasSemanticLinks } from "../../../lib/extraction-qa/atom-schema.ts";
import { runStrictPreValidation } from "../../../lib/extraction-qa/deterministic-checks.ts";
import { linkChunk } from "../../../lib/extraction-qa/openai-qa.ts";
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
    p_stage: "link",
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
      message: "No chunks ready for link",
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  let processed = 0;
  const requestId = crypto.randomUUID();

  for (const chunk of chunks) {
    try {
      const extraction = asExtractionJson(chunk.extraction_json);
      const sourceText = chunk.content ?? "";

      if (hasSemanticLinks(extraction)) {
        if (!dryRun) {
          await supabase
            .from("story_chunks")
            .update({ extraction_qa_status: "passed" })
            .eq("story_id", chunk.story_id)
            .eq("chunk_index", chunk.chunk_index);
        }
        processed++;
        continue;
      }

      const metadata = await loadStoryMetadata(supabase, chunk.story_id, chunk.chunk_index);
      const links = await linkChunk(
        OPENAI_API_KEY,
        MODEL,
        {
          ...metadataPayload(metadata),
          chunk_text: sourceText,
          extraction_json: extraction,
        },
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      const linked = {
        ...extraction,
        claim_evidence_links: links.claim_evidence_links ?? [],
        position_claim_links: links.position_claim_links ?? [],
        position_evidence_links: links.position_evidence_links ?? [],
        event_claim_links: links.event_claim_links ?? [],
        event_evidence_links: links.event_evidence_links ?? [],
      };

      const linkCheck = runStrictPreValidation(sourceText, linked, { atomsOnly: false });
      if (!linkCheck.passes) {
        return json({
          error: "Link validation failed",
          story_id: chunk.story_id,
          chunk_index: chunk.chunk_index,
          blocking_issues: linkCheck.blocking_issues,
        }, 422);
      }

      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: linked,
            extraction_qa_status: "passed",
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }
      }

      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[link_chunk_entities] Error:", chunk.story_id, chunk.chunk_index, msg);
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
