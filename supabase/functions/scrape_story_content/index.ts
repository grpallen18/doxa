// Supabase Edge Function: scrape full body text from URLs for KEEP stories.
// Writes to scraped_content only (content_full from NewsAPI is never touched).
// Sets scrape_skipped when a story cannot be scraped (no URL or scrape failed). No LLM.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Invoke: POST with Bearer SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

type StoryRow = {
  story_id: string;
  url: string | null;
  scraped_content: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_STORIES = 5;
const SCRAPE_TIMEOUT_MS = 15000;
const CONTENT_MIN_LENGTH = 500;

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

function stripHtml(html: string): string {
  try {
    const noScript = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    const noStyle = noScript.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    const noTags = noStyle.replace(/<[^>]+>/g, " ");
    return noTags.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function fetchFullContent(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "User-Agent": "DoxaBot/1.0 (content extraction)" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
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
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) body = rawBody as Record<string, unknown>;
  } catch {
    // use defaults
  }
  const maxStories = clampInt(body.max_stories, 1, 10, MAX_STORIES);
  const contentMinLength = clampInt(body.content_min_length, 0, 10000, CONTENT_MIN_LENGTH);
  const dryRun = Boolean(body.dry_run ?? false);

  let supabase: ReturnType<typeof createClient> | null = null;
  let storyIds: string[] = [];

  try {
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: candidatesRaw, error: fetchErr } = await supabase
      .from("stories")
      .select("story_id, url, scraped_content")
      .eq("relevance_status", "KEEP")
      .eq("being_processed", false)
      .eq("scrape_skipped", false)
      .order("created_at", { ascending: true })
      .limit(Math.max(maxStories * 3, 30));

    if (fetchErr) {
      console.error("[scrape_story_content] Fetch error:", fetchErr.message);
      return json({ error: fetchErr.message }, 500);
    }

    const all = (Array.isArray(candidatesRaw) ? candidatesRaw : []).filter(
      (s): s is StoryRow => typeof s === "object" && s !== null && typeof (s as StoryRow).story_id === "string"
    );
    const candidates = all
      .filter((s) => ((s.scraped_content ?? "").trim().length < contentMinLength))
      .slice(0, maxStories);

    if (candidates.length === 0) {
      return json({ ok: true, processed: 0, message: "No KEEP stories to scrape" });
    }

    let processed = 0;
    let totalChars = 0;

    for (const story of candidates) {
      storyIds = [story.story_id];
      const { error: lockErr } = await supabase.from("stories").update({ being_processed: true }).in("story_id", storyIds);
      if (lockErr) {
        console.error("[scrape_story_content] Lock error:", lockErr.message);
        break;
      }
      try {
        const storyUrl = (story.url ?? "").trim();
        if (!storyUrl) {
          if (!dryRun) {
            const { error: upErr } = await supabase
              .from("stories")
              .update({ scrape_skipped: true })
              .eq("story_id", story.story_id);
            if (upErr) console.error("[scrape_story_content] Update scrape_skipped (no URL) error:", upErr.message);
          }
          processed += 1;
          continue;
        }
        let scraped = "";
        try {
          scraped = await fetchFullContent(storyUrl);
        } catch (_) {
          scraped = "";
        }
        if (!dryRun) {
          if (scraped.length === 0) {
            const { error: upErr } = await supabase
              .from("stories")
              .update({ scrape_skipped: true })
              .eq("story_id", story.story_id);
            if (upErr) console.error("[scrape_story_content] Update scrape_skipped (scrape failed) error:", upErr.message);
          } else {
            const { error: upErr } = await supabase
              .from("stories")
              .update({ scraped_content: scraped })
              .eq("story_id", story.story_id);
            if (upErr) {
              console.error("[scrape_story_content] Update scraped_content error:", upErr.message);
            } else {
              totalChars += scraped.length;
            }
          }
        } else if (scraped.length > 0) {
          totalChars += scraped.length;
        }
        processed += 1;
      } finally {
        const { error: unlockErr } = await supabase
          .from("stories")
          .update({ being_processed: false })
          .in("story_id", storyIds);
        if (unlockErr) console.error("[scrape_story_content] Unlock error:", unlockErr.message);
      }
    }

    return json({
      ok: true,
      processed,
      dry_run: dryRun,
      chars_stored: dryRun ? 0 : totalChars,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
    console.error("[scrape_story_content] Error:", msg, e);
    return json({ error: msg }, 500);
  } finally {
    if (supabase && storyIds.length > 0) {
      const { error: unlockErr } = await supabase
        .from("stories")
        .update({ being_processed: false })
        .in("story_id", storyIds);
      if (unlockErr) console.error("[scrape_story_content] Unlock error:", unlockErr.message);
    }
  }
});
