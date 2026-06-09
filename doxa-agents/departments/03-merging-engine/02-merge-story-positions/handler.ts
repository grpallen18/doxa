// Merge chunk positions into story_positions (positions-only pipeline).

import { createClient } from "npm:@supabase/supabase-js@2";
import { holderToSpeakerType, provenanceMetadata } from "../../../lib/extraction-qa/atom-schema.ts";
import {
  callOpenAIJson,
  MERGE_POSITIONS_SYSTEM_PROMPT,
} from "../../../lib/extraction-qa/openai-qa.ts";
import { loadStoryMetadata, metadataPayload } from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_STORIES = 1;

const MERGE_POSITIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_text: { type: "string" },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
          signal_type: { type: "string" },
        },
        required: ["raw_text", "extraction_confidence", "signal_type"],
        additionalProperties: false,
      },
    },
  },
  required: ["positions"],
  additionalProperties: false,
} as const;

type MergePosition = {
  raw_text: string;
  extraction_confidence: number;
  signal_type?: string;
  source_ownership?: Record<string, unknown>;
  source_excerpt?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function clampNum(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

async function callMergePositionsLLM(
  apiKey: string,
  model: string,
  metadata: Awaited<ReturnType<typeof loadStoryMetadata>>,
  chunkBlobs: unknown[],
  requestId: string
): Promise<{ positions: MergePosition[] }> {
  const parsed = await callOpenAIJson<{ positions?: MergePosition[] }>(
    apiKey,
    model,
    MERGE_POSITIONS_SYSTEM_PROMPT,
    { ...metadataPayload(metadata), chunk_blobs: chunkBlobs },
    "doxa_merge_story_positions",
    MERGE_POSITIONS_JSON_SCHEMA as unknown as Record<string, unknown>,
    requestId
  );
  return { positions: Array.isArray(parsed?.positions) ? parsed.positions : [] };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    /* defaults */
  }
  const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
  if (invalidStoryId) return json({ error: invalidUuidMessage("story_id") }, 400);

  const maxStories = clampInt(body.max_stories, 1, 5, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let toProcess: string[] = [];

  if (singleStoryId) {
    const { data: storyRow, error: storyErr } = await supabase
      .from("stories")
      .select("story_id")
      .eq("story_id", singleStoryId)
      .maybeSingle();
    if (storyErr) return json({ error: storyErr.message }, 500);
    if (!storyRow) return json({ error: "Story not found", story_id: singleStoryId }, 404);

    const { data: readyRaw, error: readyErr } = await supabase.rpc("get_stories_ready_to_merge_positions", {
      p_limit: 100,
    });
    if (readyErr) return json({ error: readyErr.message }, 500);
    const readyIds = new Set(
      (Array.isArray(readyRaw) ? readyRaw : [])
        .map((r: { story_id?: string }) => r?.story_id)
        .filter((id): id is string => typeof id === "string")
    );
    if (!readyIds.has(singleStoryId)) {
      return json(
        {
          error:
            "Story is not ready to merge positions — all chunks must be extracted, positions QA passed, and no story_positions yet.",
          story_id: singleStoryId,
        },
        409
      );
    }

    toProcess = [singleStoryId];
  } else {
    const { data: readyRaw, error: rpcErr } = await supabase.rpc("get_stories_ready_to_merge_positions", {
      p_limit: maxStories,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    toProcess = (Array.isArray(readyRaw) ? readyRaw : [])
      .map((r: { story_id?: string }) => r?.story_id)
      .filter((id): id is string => typeof id === "string");
  }

  if (toProcess.length === 0) {
    return json({
      ok: true,
      processed: 0,
      story_positions: 0,
      message: "No stories ready to merge positions",
      dry_run: dryRun,
      ...testScopeFields({ storyId: singleStoryId }),
    });
  }

  const requestId = `merge-positions-${Date.now()}`;
  let runId: string | null = null;

  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "merge_story_positions",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    } catch {
      /* continue */
    }
  }

  let processed = 0;
  let totalPositions = 0;

  for (const storyId of toProcess) {
    const { data: chunks } = await supabase
      .from("story_chunks")
      .select("positions_extraction_json")
      .eq("story_id", storyId)
      .order("chunk_index", { ascending: true });

    const blobs = (chunks ?? [])
      .map((c: { positions_extraction_json: unknown }) => c.positions_extraction_json)
      .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object" && !Array.isArray(b));

    if (blobs.length === 0) continue;

    let mergePositions: MergePosition[] = [];
    try {
      const storyMetadata = await loadStoryMetadata(supabase, storyId);
      const mergeResult = await callMergePositionsLLM(
        OPENAI_API_KEY,
        MODEL,
        storyMetadata,
        blobs,
        `${requestId}-${storyId}`
      );
      mergePositions = mergeResult.positions;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!dryRun && runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
      return json({ error: msg, story_id: storyId }, 500);
    }

    if (dryRun) {
      totalPositions += mergePositions.length;
      processed += 1;
      continue;
    }

    for (const p of mergePositions) {
      const conf = clampNum(p.extraction_confidence, 0, 1, 0.5);
      const prov = provenanceMetadata(p as Record<string, unknown>);
      const ownership = p.source_ownership ?? {};
      const holder = (ownership as { is_attributed_to_other_actor?: boolean }).is_attributed_to_other_actor
        ? "quoted"
        : "narrator";
      const speakerType = holderToSpeakerType(holder === "quoted" ? "quoted_actor" : "article");

      await supabase.from("story_positions").insert({
        story_id: storyId,
        raw_text: (p.raw_text ?? "").trim() || "Unspecified",
        extraction_confidence: conf,
        excerpt_text: String(p.source_excerpt ?? prov.source_excerpt ?? "").trim() || null,
        speaker_type: speakerType,
        run_id: runId,
      });
      totalPositions += 1;
    }

    processed += 1;
  }

  if (!dryRun && runId) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        counts: { stories: processed, story_positions: totalPositions },
      })
      .eq("run_id", runId);
  }

  return json({
    ok: true,
    processed,
    story_positions: totalPositions,
    dry_run: dryRun,
    run_id: runId,
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
