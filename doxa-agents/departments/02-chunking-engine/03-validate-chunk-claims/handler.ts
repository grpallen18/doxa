// Deterministic validation for claims-only chunk extraction.
// Body: { max_chunks?, dry_run?, story_id?, chunk_index? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { runStrictPreValidation } from "../../../lib/extraction-qa/deterministic-checks.ts";
import { saveArtifact } from "../../../lib/extraction-qa/openai-qa.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";
import { asExtractionJson, clampInt, corsHeaders, json } from "../../../lib/extraction-qa/types.ts";

const DEFAULT_MAX = 5;

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
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
    p_stage: "validate_claims",
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
      message: "No chunks ready for claims validation",
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  let processed = 0;

  for (const chunk of chunks) {
    const extraction = asExtractionJson(chunk.extraction_json);
    const result = runStrictPreValidation(chunk.content ?? "", extraction, {
      claimsOnly: true,
      atomsOnly: true,
    });

    const nextStatus = result.passes ? "passed" : "needs_human_review";
    const validationReport = {
      passes: result.passes,
      blocking_issues: result.blocking_issues,
      issues: result.issues,
      deterministic_checks: result.deterministic_checks,
    };

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from("story_chunks")
        .update({
          extraction_qa_status: nextStatus,
          extraction_qa_validation_report: validationReport,
          extraction_qa_validated_at: new Date().toISOString(),
        })
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index);

      if (updateErr) return json({ error: updateErr.message }, 500);

      await saveArtifact(supabase, {
        story_id: chunk.story_id,
        chunk_index: chunk.chunk_index,
        stage: "chunk_validate_claims",
        input_snapshot: extraction,
        report: validationReport,
      });
    }

    processed += 1;
  }

  return json({
    ok: true,
    processed,
    dry_run: dryRun,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
