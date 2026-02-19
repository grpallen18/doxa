// Supabase Edge Function: dispatch one KEEP story per run to Cloudflare Worker for scraping.
// Worker scrapes and calls receive_scraped_content; this function only selects, locks, records domain throttle, and POSTs to Worker.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SCRAPE_URL, SCRAPE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  const { data: storiesRaw, error: rpcErr } = await supabase
    .rpc("get_stories_ready_for_scrape", { p_limit: 1 });

  if (rpcErr) {
    console.error("[scrape_story_content] RPC error:", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  const stories = Array.isArray(storiesRaw) ? storiesRaw : [];
  const story = stories[0] as { story_id: string; url: string | null } | undefined;

  if (!story?.story_id) {
    return json({ ok: true, dispatched: 0, message: "No stories ready for scrape" });
  }

  const url = (story.url ?? "").trim();
  if (!url) {
    return json({ ok: true, dispatched: 0, message: "Story has no URL" });
  }

  const domain = domainFromUrl(url);
  if (!domain) {
    return json({ ok: true, dispatched: 0, message: "Could not parse domain from URL" });
  }

  if (!dryRun) {
    const { error: lockErr } = await supabase
      .from("stories")
      .update({ being_processed: true })
      .eq("story_id", story.story_id);

    if (lockErr) {
      console.error("[scrape_story_content] Lock error:", lockErr.message);
      return json({ error: lockErr.message }, 500);
    }

    const now = new Date();
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
        const { error: incErr } = await supabase.rpc("increment_scrape_fail_and_maybe_skip", {
          p_story_id: story.story_id,
        });
        if (incErr) console.error("[scrape_story_content] RPC error:", incErr.message);
      }
      return json({ error: `Worker returned ${res.status}`, story_id: story.story_id }, 502);
    }
    return json({ ok: true, dispatched: 1, story_id: story.story_id, dry_run: dryRun });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[scrape_story_content] Worker request error:", msg);
    if (!dryRun) {
      const { error: incErr } = await supabase.rpc("increment_scrape_fail_and_maybe_skip", {
        p_story_id: story.story_id,
      });
      if (incErr) console.error("[scrape_story_content] RPC error:", incErr.message);
    }
    return json({ error: msg, story_id: story.story_id }, 502);
  }
});
