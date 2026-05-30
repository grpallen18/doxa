// Supabase Edge Function: extract atoms + provenance from story chunks (LLM).
// Writes extraction_json to story_chunks (claims, evidence, positions, events only).
// Pipeline: chunk_story_bodies -> extract_story_entities -> chunk QA -> link_chunk_entities -> merge.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  attachProvenance,
  EXTRACT_ATOMS_JSON_SCHEMA,
  normalizeAtomRow,
} from "../../../lib/extraction-qa/atom-schema.ts";
import { EXTRACT_SYSTEM_PROMPT } from "../../../lib/extraction-qa/openai-qa.ts";
import {
  loadStoryMetadataBatch,
  metadataPayload,
  type StoryAgentMetadata,
} from "../../../lib/extraction-qa/story-metadata.ts";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_EXTRACT_MODEL = "gpt-5.4-nano-2026-03-17";
const DEFAULT_MAX_CHUNKS = 5;

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

const POSITION_CONFIDENCE_THRESHOLD = 0.5;
const EVENT_CONFIDENCE_THRESHOLD = 0.45;

async function callOpenAIChunk(
  apiKey: string,
  model: string,
  metadata: StoryAgentMetadata,
  content: string,
  storyId: string,
  chunkIndex: number,
  requestId: string
): Promise<{
  claims: unknown[];
  evidence: unknown[];
  positions: unknown[];
  events: unknown[];
}> {
  const system = `${EXTRACT_SYSTEM_PROMPT}

OUTPUT: claims, evidence, positions, events only. Each atom requires source_excerpt (verbatim chunk span), span_start, span_end, extraction_confidence.`;

  const userPayload = {
    ...metadataPayload(metadata),
    chunk_text: content,
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doxa_extract_story_atoms",
          strict: true,
          schema: EXTRACT_ATOMS_JSON_SCHEMA,
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[extract_story_entities] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as {
    claims?: unknown[];
    evidence?: unknown[];
    positions?: unknown[];
    events?: unknown[];
  };

  const claimsRaw = (Array.isArray(parsed?.claims) ? parsed.claims : []).map((c) =>
    normalizeAtomRow("claim", c as Record<string, unknown>)
  );
  const evidenceRaw = (Array.isArray(parsed?.evidence) ? parsed.evidence : []).map((e) =>
    normalizeAtomRow("evidence", e as Record<string, unknown>)
  );
  const positionsRaw = (Array.isArray(parsed?.positions) ? parsed.positions : []).map((p) =>
    normalizeAtomRow("position", p as Record<string, unknown>)
  );
  const eventsRaw = (Array.isArray(parsed?.events) ? parsed.events : []).map((e) =>
    normalizeAtomRow("event", e as Record<string, unknown>)
  );

  const positions = positionsRaw.filter(
    (p) =>
      typeof (p as { extraction_confidence?: number }).extraction_confidence === "number" &&
      (p as { extraction_confidence: number }).extraction_confidence >= POSITION_CONFIDENCE_THRESHOLD
  );
  const events = eventsRaw.filter((e) => {
    const conf =
      typeof (e as { extraction_confidence?: number }).extraction_confidence === "number"
        ? (e as { extraction_confidence: number }).extraction_confidence
        : 0.55;
    return conf >= EVENT_CONFIDENCE_THRESHOLD;
  });

  return {
    claims: attachProvenance(claimsRaw, storyId, chunkIndex),
    evidence: attachProvenance(evidenceRaw, storyId, chunkIndex),
    positions: attachProvenance(positions, storyId, chunkIndex),
    events: attachProvenance(events, storyId, chunkIndex),
  };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL =
    Deno.env.get("OPENAI_MODEL_EXTRACT") ??
    Deno.env.get("OPENAI_MODEL") ??
    DEFAULT_EXTRACT_MODEL;

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

  const maxChunks = clampInt(body.max_chunks, 1, 20, DEFAULT_MAX_CHUNKS);
  const dryRun = Boolean(body.dry_run ?? false);
  const chunkIndexParam =
    body.chunk_index !== undefined && body.chunk_index !== null
      ? clampInt(body.chunk_index, 0, 10_000, -1)
      : -1;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let fetchQuery = supabase
    .from("story_chunks")
    .select("story_id, chunk_index, content")
    .is("extraction_json", null);
  if (singleStoryId) fetchQuery = fetchQuery.eq("story_id", singleStoryId);
  if (chunkIndexParam >= 0) fetchQuery = fetchQuery.eq("chunk_index", chunkIndexParam);
  const { data: chunksRaw, error: fetchErr } = await fetchQuery
    .order("story_id", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(singleStoryId ? 100 : maxChunks);

  if (fetchErr) {
    console.error("[extract_story_entities] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const chunks = (Array.isArray(chunksRaw) ? chunksRaw : []).filter(
    (c): c is { story_id: string; chunk_index: number; content: string } =>
      typeof c === "object" && c !== null && typeof (c as { story_id: unknown }).story_id === "string"
  );

  if (chunks.length === 0) {
    return json({
      ok: true,
      processed: 0,
      message: "No chunks to extract",
      ...testScopeFields({ storyId: singleStoryId }),
      chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : undefined,
    });
  }

  let runId: string | null = null;
  if (!dryRun) {
    try {
      const { data: runData } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "extract_story_entities",
          status: "running",
          started_at: new Date().toISOString(),
          model_provider: "openai",
          model_name: MODEL,
        })
        .select("run_id")
        .single();
      if (runData?.run_id) runId = runData.run_id;
    } catch (_) {
      /* continue */
    }
  }

  const requestId = `extract-chunk-${Date.now()}`;
  let processed = 0;

  const metadataByStory = await loadStoryMetadataBatch(
    supabase,
    chunks.map((c) => c.story_id)
  );

  for (const chunk of chunks) {
    try {
      const baseMeta = metadataByStory.get(chunk.story_id)!;
      const metadata: StoryAgentMetadata = { ...baseMeta, chunk_index: chunk.chunk_index };
      const result = await callOpenAIChunk(
        OPENAI_API_KEY,
        MODEL,
        metadata,
        chunk.content ?? "",
        chunk.story_id,
        chunk.chunk_index,
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      if (!dryRun) {
        const extractionJson = {
          claims: result.claims,
          evidence: result.evidence,
          positions: result.positions,
          events: result.events,
        };
        const now = new Date().toISOString();

        const { error: updateErr } = await supabase
          .from("story_chunks")
          .update({
            extraction_json: extractionJson,
            extraction_completed_at: now,
            extraction_qa_status: "pending",
            extraction_qa_review_report: null,
            extraction_qa_validation_report: null,
            extraction_qa_refinement_count: 0,
            extraction_qa_validated_at: null,
          })
          .eq("story_id", chunk.story_id)
          .eq("chunk_index", chunk.chunk_index);

        if (updateErr) {
          console.error("[extract_story_entities] Update error:", updateErr.message);
          return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
        }
      }

      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[extract_story_entities] Error for chunk:", chunk.story_id, chunk.chunk_index, msg);
      if (!dryRun && runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
      return json({ error: msg, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
    }
  }

  if (!dryRun && runId) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        counts: { chunks: processed },
      })
      .eq("run_id", runId);
  }

  return json({
    ok: true,
    processed,
    model: MODEL,
    run_id: runId,
    dry_run: dryRun,
    ...testScopeFields({ storyId: singleStoryId }),
    chunk_index: chunkIndexParam >= 0 ? chunkIndexParam : undefined,
  });
};
