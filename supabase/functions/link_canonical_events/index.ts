// Supabase Edge Function: link story_events to canonical events via blocking_key + embedding similarity.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_EMBEDDING_MODEL, EVENT_SIMILARITY_THRESHOLD.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_events?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildBlockingKey } from "../_shared/event-blocking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;
const DEFAULT_MAX_EVENTS = 10;
const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

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

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) {
    throw new Error("Invalid embedding response");
  }
  return emb;
}

async function topicHintForStory(
  supabase: ReturnType<typeof createClient>,
  storyId: string
): Promise<string> {
  const { data: rows } = await supabase
    .from("topic_stories")
    .select("topic_id")
    .eq("story_id", storyId)
    .limit(1);
  const topicId = (rows?.[0] as { topic_id?: string } | undefined)?.topic_id;
  return topicId ?? "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  const similarityThreshold = clampNum(
    Deno.env.get("EVENT_SIMILARITY_THRESHOLD"),
    0,
    1,
    DEFAULT_SIMILARITY_THRESHOLD
  );

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
  const maxEvents = clampInt(body.max_events, 1, 50, DEFAULT_MAX_EVENTS);
  const dryRun = Boolean(body.dry_run ?? false);
  const maxDistance = 1 - similarityThreshold;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: rows, error: fetchErr } = await supabase
    .from("story_events")
    .select(
      "story_event_id, story_id, event_summary, primary_actor, action, object, event_date, event_timeframe_start, event_timeframe_end, location, event_type"
    )
    .is("event_id", null)
    .order("created_at", { ascending: true })
    .limit(maxEvents);

  if (fetchErr) {
    console.error("[link_canonical_events] Fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const storyEvents = (Array.isArray(rows) ? rows : []).filter(
    (r): r is {
      story_event_id: string;
      story_id: string;
      event_summary: string;
      primary_actor: string | null;
      action: string | null;
      object: string | null;
      event_date: string | null;
      event_timeframe_start: string | null;
      event_timeframe_end: string | null;
      location: string | null;
      event_type: string | null;
    } => typeof r === "object" && r !== null && typeof (r as { story_event_id: unknown }).story_event_id === "string"
  );

  if (storyEvents.length === 0) {
    return json({ ok: true, processed: 0, linked: 0, created: 0, message: "No story_events to link", dry_run: dryRun });
  }

  const topicCache = new Map<string, string>();
  let linked = 0;
  let created = 0;

  for (const se of storyEvents) {
    const summary = (se.event_summary ?? "").trim();
    if (!summary) continue;

    let topicHint = topicCache.get(se.story_id);
    if (topicHint === undefined) {
      topicHint = await topicHintForStory(supabase, se.story_id);
      topicCache.set(se.story_id, topicHint);
    }

    const blockingKey = buildBlockingKey({
      primary_actor: se.primary_actor,
      action: se.action,
      event_date: se.event_date,
      event_timeframe_start: se.event_timeframe_start,
      event_timeframe_end: se.event_timeframe_end,
      topic_hint: topicHint,
    });

    let embedding: number[];
    try {
      embedding = await getEmbedding(OPENAI_API_KEY, summary, MODEL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[link_canonical_events] Embedding error:", msg);
      return json({ error: msg, story_event_id: se.story_event_id }, 500);
    }

    const embeddingStr = `[${embedding.join(",")}]`;

    const { data: matchRows, error: rpcErr } = await supabase.rpc("match_events_nearest", {
      query_embedding: embeddingStr,
      p_blocking_key: blockingKey,
      match_count: 3,
    });

    if (rpcErr) {
      console.error("[link_canonical_events] RPC error:", rpcErr.message);
      return json({ error: rpcErr.message, story_event_id: se.story_event_id }, 500);
    }

    const matches = Array.isArray(matchRows) ? matchRows : [];
    const best = matches[0] as { event_id?: string; distance?: number } | undefined;
    const distance = typeof best?.distance === "number" ? best.distance : 1;

    if (distance <= maxDistance && best?.event_id) {
      if (!dryRun) {
        const { error: upErr } = await supabase
          .from("story_events")
          .update({ event_id: best.event_id, embedding: embeddingStr })
          .eq("story_event_id", se.story_event_id);

        if (upErr) {
          console.error("[link_canonical_events] Update link error:", upErr.message);
          return json({ error: upErr.message }, 500);
        }
      }
      linked += 1;
    } else {
      const normalized = summary.toLowerCase().trim().replace(/\s+/g, " ");
      let canonicalHash = await sha256Hex(normalized);
      if (dryRun) {
        created += 1;
      } else {
        let attempts = 0;
        while (attempts < 5) {
          const now = new Date().toISOString();
          const { data: ins, error: insErr } = await supabase
            .from("events")
            .insert({
              canonical_text: summary,
              canonical_hash: canonicalHash,
              blocking_key: blockingKey,
              primary_actor: se.primary_actor,
              action: se.action,
              object: se.object,
              event_date: se.event_date,
              event_timeframe_start: se.event_timeframe_start,
              event_timeframe_end: se.event_timeframe_end,
              location: se.location,
              event_type: se.event_type,
              embedding: embeddingStr,
              metadata: {},
              updated_at: now,
            })
            .select("event_id")
            .single();

          if (!insErr) {
            const { error: upErr } = await supabase
              .from("story_events")
              .update({ event_id: ins?.event_id, embedding: embeddingStr })
              .eq("story_event_id", se.story_event_id);

            if (upErr) {
              console.error("[link_canonical_events] Update new event error:", upErr.message);
              return json({ error: upErr.message }, 500);
            }
            created += 1;
            break;
          }

          if (insErr.code === "23505") {
            canonicalHash = `${canonicalHash}_${crypto.randomUUID().slice(0, 8)}`;
            attempts += 1;
            continue;
          }

          console.error("[link_canonical_events] Insert event error:", insErr.message);
          return json({ error: insErr.message }, 500);
        }
      }
    }
  }

  return json({
    ok: true,
    processed: storyEvents.length,
    linked,
    created,
    similarity_threshold: similarityThreshold,
    dry_run: dryRun,
  });
});
