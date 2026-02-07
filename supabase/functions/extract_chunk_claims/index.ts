// Supabase Edge Function: extract claims, evidence, and links from story chunks (LLM).
// Writes extraction_json to story_chunks. Pipeline: chunk_story_bodies -> extract_chunk_claims -> merge_story_claims.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_chunks?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
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

async function callOpenAIChunk(
  apiKey: string,
  model: string,
  storyId: string,
  chunkIndex: number,
  content: string,
  requestId: string
): Promise<{ claims: unknown[]; evidence: unknown[]; links: unknown[] }> {
  const system = `You extract claims and supporting/contradicting evidence from a news story segment for DOXA.
You are given one segment of a longer story. Do not browse the web.

Claims: distinct factual or normative assertions. Use polarity: asserts | denies | uncertain. raw_text is the exact or paraphrased claim. extraction_confidence 0-1.
Evidence: quotes, statistics, document refs, dataset refs. Use evidence_type: quote | statistic | document_ref | dataset_ref | other. excerpt is the supporting text. attribution/source_ref if available.
Links: which evidence supports/contradicts/contextualizes which claim. claim_index and evidence_index are 0-based into the claims and evidence arrays in THIS response. relation_type: supports | contradicts | contextual. confidence 0-1.

Return JSON only in the required schema. If there are no claims or no evidence in this segment, return empty arrays.`;

  const userPayload = {
    story_id: storyId,
    chunk_index: chunkIndex,
    content,
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
          name: "doxa_extract_chunk_claims",
          strict: true,
          schema: {
            type: "object",
            properties: {
              claims: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    raw_text: { type: "string" },
                    polarity: { type: "string", enum: ["asserts", "denies", "uncertain"] },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    span_start: { type: ["integer", "null"] },
                    span_end: { type: ["integer", "null"] },
                  },
                  required: ["raw_text", "polarity", "extraction_confidence"],
                  additionalProperties: false,
                },
              },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    evidence_type: { type: "string", enum: ["quote", "statistic", "document_ref", "dataset_ref", "other"] },
                    excerpt: { type: "string" },
                    extraction_confidence: { type: "number", minimum: 0, maximum: 1 },
                    attribution: { type: ["string", "null"] },
                    source_ref: { type: ["string", "null"] },
                  },
                  required: ["evidence_type", "excerpt", "extraction_confidence"],
                  additionalProperties: false,
                },
              },
              links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    claim_index: { type: "integer", minimum: 0 },
                    evidence_index: { type: "integer", minimum: 0 },
                    relation_type: { type: "string", enum: ["supports", "contradicts", "contextual"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    rationale: { type: ["string", "null"] },
                  },
                  required: ["claim_index", "evidence_index", "relation_type", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["claims", "evidence", "links"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[extract_chunk_claims] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as { claims?: unknown[]; evidence?: unknown[]; links?: unknown[] };
  return {
    claims: Array.isArray(parsed?.claims) ? parsed.claims : [],
    evidence: Array.isArray(parsed?.evidence) ? parsed.evidence : [],
    links: Array.isArray(parsed?.links) ? parsed.links : [],
  };
}

Deno.serve(async (req: Request) => {
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
    // use defaults
  }
  const maxChunks = clampInt(body.max_chunks, 1, 20, DEFAULT_MAX_CHUNKS);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: chunksRaw, error: fetchErr } = await supabase
    .from("story_chunks")
    .select("story_id, chunk_index, content")
    .is("extraction_json", null)
    .order("story_id", { ascending: true })
    .order("chunk_index", { ascending: true })
    .limit(maxChunks);

  if (fetchErr) {
    console.error("[extract_chunk_claims] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const chunks = (Array.isArray(chunksRaw) ? chunksRaw : []).filter(
    (c): c is { story_id: string; chunk_index: number; content: string } =>
      typeof c === "object" && c !== null && typeof (c as { story_id: unknown }).story_id === "string"
  );

  if (chunks.length === 0) {
    return json({ ok: true, processed: 0, message: "No chunks to extract" });
  }

  let runId: string | null = null;
  try {
    const { data: runData } = await supabase
      .from("pipeline_runs")
      .insert({
        pipeline_name: "chunk_extraction",
        status: "running",
        started_at: new Date().toISOString(),
        model_provider: "openai",
        model_name: MODEL,
      })
      .select("run_id")
      .single();
    if (runData?.run_id) runId = runData.run_id;
  } catch (_) {
    // continue without run_id
  }

  const requestId = `extract-chunk-${Date.now()}`;
  let processed = 0;

  for (const chunk of chunks) {
    try {
      const result = await callOpenAIChunk(
        OPENAI_API_KEY,
        MODEL,
        chunk.story_id,
        chunk.chunk_index,
        chunk.content ?? "",
        `${requestId}-${chunk.story_id}-${chunk.chunk_index}`
      );

      const extractionJson = {
        claims: result.claims,
        evidence: result.evidence,
        links: result.links,
      };

      const { error: updateErr } = await supabase
        .from("story_chunks")
        .update({ extraction_json: extractionJson })
        .eq("story_id", chunk.story_id)
        .eq("chunk_index", chunk.chunk_index);

      if (updateErr) {
        console.error("[extract_chunk_claims] Update error:", updateErr.message);
        return json({ error: updateErr.message, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
      }

      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[extract_chunk_claims] Error for chunk:", chunk.story_id, chunk.chunk_index, msg);
      if (runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: msg })
          .eq("run_id", runId);
      }
      return json({ error: msg, story_id: chunk.story_id, chunk_index: chunk.chunk_index }, 500);
    }
  }

  if (runId) {
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
  });
});
