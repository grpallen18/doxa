// Supabase Edge Function: atomically claim one story and dispatch to Cloudflare Worker.
// Completion is via receive_scraped_content (callback). Stale dispatches are released in claim_stories_for_scrape.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SCRAPE_URL, SCRAPE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Wait only for worker HTTP acceptance; scrape+callback may continue asynchronously. */
const WORKER_ACCEPT_TIMEOUT_MS = 15_000;

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

export const handler = async (req: Request) => {
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

  const { data: storiesRaw, error: rpcErr } = await supabase.rpc("claim_stories_for_scrape", {
    p_limit: 1,
    p_dry_run: dryRun,
  });

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
    const now = new Date();
    await supabase.from("domain_throttle").upsert(
      { domain, last_dispatched_at: now.toISOString() },
      { onConflict: "domain" }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_ACCEPT_TIMEOUT_MS);

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
      const errText = await res.text().catch(() => "");
      console.error("[scrape_story_content] Worker response:", res.status, errText.slice(0, 300));
      // Receive may still run on the worker; stale release handles abandoned dispatches.
      return json({
        ok: true,
        dispatched: 1,
        story_id: story.story_id,
        worker_status: res.status,
        dry_run: dryRun,
        note: "Worker returned non-OK; dispatch left in-flight until receive or stale release",
      });
    }

    return json({ ok: true, dispatched: 1, story_id: story.story_id, dry_run: dryRun });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === "AbortError";
    console.warn("[scrape_story_content] Worker request:", isAbort ? "timeout" : msg);
    return json({
      ok: true,
      dispatched: 1,
      story_id: story.story_id,
      dry_run: dryRun,
      worker_timeout: isAbort,
      note: "Dispatch remains in-flight; receive or stale release will reconcile",
    });
  }
};
