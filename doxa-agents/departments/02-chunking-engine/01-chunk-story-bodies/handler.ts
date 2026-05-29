// Supabase Edge Function: chunk story_bodies into story_chunks for downstream processing.
// Selects unchunked stories, splits content (3500 chars, 500 overlap), inserts into story_chunks.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY.
// Body: { max_stories?, dry_run?, story_id? } — story_id isolates one row.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  invalidUuidMessage,
  parseStoryIdFromBody,
  testScopeFields,
} from "../../../lib/pipeline-test-params.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 3500;
const CHUNK_OVERLAP = 500;
const DEFAULT_MAX_STORIES = 10;

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

export const handler = async (req: Request) => {
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
  const { id: singleStoryId, invalid: invalidStoryId } = parseStoryIdFromBody(body);
  if (invalidStoryId) return json({ error: invalidUuidMessage("story_id") }, 400);

  const maxStories = clampInt(body.max_stories, 1, 50, DEFAULT_MAX_STORIES);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let unchunked: { story_id: string; content_clean: string }[] = [];

  if (singleStoryId) {
    const { count, error: countErr } = await supabase
      .from("story_chunks")
      .select("story_id", { count: "exact", head: true })
      .eq("story_id", singleStoryId);
    if (countErr) {
      console.error("[chunk_story_bodies] chunk count error:", countErr.message);
      return json({ error: countErr.message }, 500);
    }
    if ((count ?? 0) > 0) {
      return json({
        ok: true,
        processed: 0,
        chunks_created: 0,
        message: "Story already has story_chunks",
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }
    const { data: bodyRow, error: bodyErr } = await supabase
      .from("story_bodies")
      .select("story_id, content_clean")
      .eq("story_id", singleStoryId)
      .maybeSingle();
    if (bodyErr) {
      console.error("[chunk_story_bodies] story_bodies fetch error:", bodyErr.message);
      return json({ error: bodyErr.message }, 500);
    }
    if (!bodyRow) {
      return json({ error: "Story not found", story_id: singleStoryId }, 404);
    }
    const contentClean = (bodyRow.content_clean ?? "").trim();
    if (!contentClean) {
      return json({
        ok: true,
        processed: 0,
        chunks_created: 0,
        message: "No content_clean; run clean_scraped_content first",
        ...testScopeFields({ storyId: singleStoryId }),
      });
    }
    unchunked = [{ story_id: bodyRow.story_id, content_clean: contentClean }];
  } else {
    const { data: unchunkedRaw, error: rpcErr } = await supabase.rpc("get_unchunked_story_bodies", {
      p_limit: maxStories,
    });

    if (rpcErr) {
      console.error("[chunk_story_bodies] get_unchunked_story_bodies error:", rpcErr.message);
      return json({ error: rpcErr.message }, 500);
    }

    unchunked = (Array.isArray(unchunkedRaw) ? unchunkedRaw : []).filter(
      (b): b is { story_id: string; content_clean: string } =>
        typeof b === "object" && b !== null && typeof (b as { story_id: unknown }).story_id === "string"
    );
  }

  if (unchunked.length === 0) {
    return json({
      ok: true,
      processed: 0,
      chunks_created: 0,
      message: "No unchunked stories",
      ...testScopeFields({ storyId: singleStoryId }),
    });
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
    ...testScopeFields({ storyId: singleStoryId }),
  });
};
