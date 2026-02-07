// Supabase Edge Function: chunk story_bodies into story_chunks for downstream processing.
// Selects unchunked stories, splits content (3500 chars, 500 overlap), inserts into story_chunks.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Optional body: { max_stories: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 3500;
const CHUNK_OVERLAP = 500;
const DEFAULT_MAX_STORIES = 10;
const FETCH_LIMIT = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
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
  const maxStories = clampInt(body.max_stories, 1, 50, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: bodiesRaw, error: bodiesErr } = await supabase
    .from("story_bodies")
    .select("story_id, content_clean")
    .not("content_clean", "is", null)
    .order("scraped_at", { ascending: true })
    .limit(FETCH_LIMIT);

  if (bodiesErr) {
    console.error("[chunk_story_bodies] story_bodies fetch error:", bodiesErr.message);
    return json({ error: bodiesErr.message }, 500);
  }

  const bodies = (Array.isArray(bodiesRaw) ? bodiesRaw : []).filter(
    (b): b is { story_id: string; content_clean: string } =>
      typeof b === "object" && b !== null && typeof (b as { story_id: unknown }).story_id === "string"
  );

  if (bodies.length === 0) {
    return json({ ok: true, processed: 0, chunks_created: 0, message: "No stories to chunk" });
  }

  const storyIds = bodies.map((b) => b.story_id);
  const { data: chunkedRaw, error: chunkedErr } = await supabase
    .from("story_chunks")
    .select("story_id")
    .in("story_id", storyIds);

  if (chunkedErr) {
    console.error("[chunk_story_bodies] story_chunks fetch error:", chunkedErr.message);
    return json({ error: chunkedErr.message }, 500);
  }

  const chunkedSet = new Set(
    (Array.isArray(chunkedRaw) ? chunkedRaw : [])
      .map((r) => (r as { story_id: string }).story_id)
      .filter(Boolean)
  );

  const unchunked = bodies.filter((b) => !chunkedSet.has(b.story_id)).slice(0, maxStories);

  if (unchunked.length === 0) {
    return json({ ok: true, processed: 0, chunks_created: 0, message: "No unchunked stories" });
  }

  let totalChunks = 0;

  for (const row of unchunked) {
    const content = (row.content_clean ?? "").trim();
    const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);

    const rows = chunks.map((c, i) => ({
      story_id: row.story_id,
      chunk_index: i,
      content: c,
    }));

    if (rows.length === 0) continue;

    if (!dryRun) {
      const { error: insertErr } = await supabase.from("story_chunks").insert(rows);

      if (insertErr) {
        console.error("[chunk_story_bodies] Insert error for story", row.story_id, insertErr.message);
        return json({ error: insertErr.message, story_id: row.story_id }, 500);
      }
    }

    totalChunks += rows.length;
  }

  return json({
    ok: true,
    processed: unchunked.length,
    chunks_created: totalChunks,
    dry_run: dryRun,
  });
});
