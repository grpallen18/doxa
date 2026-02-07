// Supabase Edge Function: dispatch one KEEP story per run to Cloudflare Worker for scraping.
// Worker scrapes and calls receive_scraped_content; this function only selects, locks, records domain throttle, and POSTs to Worker.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SCRAPE_URL, SCRAPE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONTENT_MIN_LENGTH = 500;
const COOLDOWN_MINUTES = 15;
const WORKER_TIMEOUT_MS = 60_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function domainFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const WORKER_SCRAPE_URL = (Deno.env.get("WORKER_SCRAPE_URL") ?? "").replace(/\/$/, "");
  const SCRAPE_SECRET = Deno.env.get("SCRAPE_SECRET") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!WORKER_SCRAPE_URL || !SCRAPE_SECRET) {
    return json({ error: "Missing WORKER_SCRAPE_URL or SCRAPE_SECRET" }, 500);
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
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: storiesRaw, error: storiesErr } = await supabase
    .from("stories")
    .select("story_id, url")
    .in("relevance_status", ["KEEP", "PENDING"])
    .eq("being_processed", false)
    .eq("scrape_skipped", false)
    .order("created_at", { ascending: true })
    .limit(10);

  if (storiesErr) {
    console.error("[scrape_story_content] Stories fetch error:", storiesErr.message);
    return json({ error: storiesErr.message }, 500);
  }

  const stories = (Array.isArray(storiesRaw) ? storiesRaw : []).filter(
    (s): s is { story_id: string; url: string | null } =>
      typeof s === "object" && s !== null && typeof (s as { story_id: string; url: string | null }).story_id === "string"
  );

  if (stories.length === 0) {
    return json({ ok: true, dispatched: 0, message: "No KEEP or PENDING stories to scrape" });
  }

  const storyIds = stories.map((s) => s.story_id);
  const { data: bodiesRaw } = await supabase
    .from("story_bodies")
    .select("story_id, content")
    .in("story_id", storyIds);

  const bodiesMap = new Map<string, number>(
    (Array.isArray(bodiesRaw) ? bodiesRaw : []).map((b) => [
      (b as { story_id: string; content: string | null }).story_id,
      ((b as { content: string | null }).content ?? "").length,
    ])
  );

  const candidates = stories.filter((s) => {
    const len = bodiesMap.get(s.story_id) ?? 0;
    return len < CONTENT_MIN_LENGTH;
  });

  if (candidates.length === 0) {
    return json({ ok: true, dispatched: 0, message: "No stories needing body" });
  }

  const now = new Date();
  const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

  for (const story of candidates) {
    const url = (story.url ?? "").trim();
    if (!url) continue;

    const domain = domainFromUrl(url);
    if (!domain) continue;

    const { data: throttleRow } = await supabase
      .from("domain_throttle")
      .select("last_dispatched_at")
      .eq("domain", domain)
      .maybeSingle();

    const lastAt = throttleRow?.last_dispatched_at;
    if (lastAt) {
      const last = new Date(lastAt).getTime();
      if (now.getTime() - last < cooldownMs) continue;
    }

    if (!dryRun) {
      const { error: lockErr } = await supabase
        .from("stories")
        .update({ being_processed: true })
        .eq("story_id", story.story_id);

      if (lockErr) {
        console.error("[scrape_story_content] Lock error:", lockErr.message);
        continue;
      }

      await supabase.from("domain_throttle").upsert(
        { domain, last_dispatched_at: now.toISOString() },
        { onConflict: "domain" }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

    try {
      const res = await fetch(`${WORKER_SCRAPE_URL}/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SCRAPE_SECRET}`,
        },
        body: JSON.stringify({ url, story_id: story.story_id, dry_run: dryRun }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        console.error("[scrape_story_content] Worker response:", res.status);
        if (!dryRun) {
          const { error: unlockErr } = await supabase
            .from("stories")
            .update({ being_processed: false })
            .eq("story_id", story.story_id);
          if (unlockErr) console.error("[scrape_story_content] Unlock error:", unlockErr.message);
        }
        return json({ error: `Worker returned ${res.status}`, story_id: story.story_id }, 502);
      }
      return json({ ok: true, dispatched: 1, story_id: story.story_id, dry_run: dryRun });
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[scrape_story_content] Worker request error:", msg);
      if (!dryRun) {
        const { error: unlockErr } = await supabase
          .from("stories")
          .update({ being_processed: false })
          .eq("story_id", story.story_id);
        if (unlockErr) console.error("[scrape_story_content] Unlock error:", unlockErr.message);
      }
      return json({ error: msg, story_id: story.story_id }, 502);
    }
  }

  return json({ ok: true, dispatched: 0, message: "No story outside domain cooldown" });
});
