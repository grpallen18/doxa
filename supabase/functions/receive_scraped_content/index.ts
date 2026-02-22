// Supabase Edge Function: receive scraped article from Cloudflare Worker.
// Validates Authorization: Bearer SCRAPE_SECRET; writes to story_bodies and updates stories flags.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCRAPE_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

// This function is called only by our Cloudflare Worker using a shared secret.
// Disable Supabase's built-in JWT check and do our own SCRAPE_SECRET check instead.
export const config = {
  runtime: "edge",
  verifyJwt: false,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getBearerSecret(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function domainFromUrl(urlStr: string): string | null {
  try {
    return new URL(urlStr.trim()).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SCRAPE_SECRET = Deno.env.get("SCRAPE_SECRET") ?? "";
  const bearer = getBearerSecret(req);
  if (!SCRAPE_SECRET.trim() || bearer !== SCRAPE_SECRET.trim()) {
    return json({ error: "Unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let body: { story_id?: string; url?: string; title?: string; content?: string; scrape_method?: string | null; error?: string; dry_run?: boolean } = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      body = raw as { story_id?: string; url?: string; title?: string; content?: string; scrape_method?: string | null; error?: string; dry_run?: boolean };
    }
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const dryRun = Boolean(body.dry_run ?? false);
  const storyId = typeof body.story_id === "string" ? body.story_id.trim() : "";
  if (!storyId) return json({ error: "story_id is required" }, 400);

  const url = typeof body.url === "string" ? body.url.trim() || null : null;
  const domain = url ? domainFromUrl(url) : null;

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const hasContent = content.length > 0;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (hasContent) {
    if (!dryRun) {
      const scrapeMethod =
        typeof body.scrape_method === "string" && ["fetch_readability", "browser_render"].includes(body.scrape_method)
          ? body.scrape_method
          : null;
      const { error: upsertErr } = await supabase.from("story_bodies").upsert(
        {
          story_id: storyId,
          content_raw: content,
          scraped_at: new Date().toISOString(),
          scrape_method: scrapeMethod,
        },
        { onConflict: "story_id" }
      );
      if (upsertErr) {
        console.error("[receive_scraped_content] story_bodies upsert error:", upsertErr.message);
        return json({ error: upsertErr.message }, 500);
      }
      const { error: updateErr } = await supabase
        .from("stories")
        .update({
          being_processed: false,
          scrape_skipped: false,
          scrape_fail_count: 0,
          scraped_at: new Date().toISOString(),
        })
        .eq("story_id", storyId);
      if (updateErr) {
        console.error("[receive_scraped_content] stories update error:", updateErr.message);
        return json({ error: updateErr.message }, 500);
      }
      const { error: logErr } = await supabase.from("scrape_log").insert({
        story_id: storyId,
        outcome: "success",
        scrape_method: scrapeMethod,
        url,
        domain,
      });
      if (logErr) console.error("[receive_scraped_content] scrape_log insert error:", logErr.message);
    }
    return json({ ok: true, story_id: storyId, dry_run: dryRun });
  }

  if (!dryRun) {
    const { error: updateErr } = await supabase
      .from("stories")
      .update({
        being_processed: false,
        scrape_skipped: true,
        scrape_skipped_at: new Date().toISOString(),
      })
      .eq("story_id", storyId);
    if (updateErr) {
      console.error("[receive_scraped_content] stories update (skip) error:", updateErr.message);
      return json({ error: updateErr.message }, 500);
    }
    const errorMsg = typeof body.error === "string" ? body.error.trim().slice(0, 500) : null;
    const { error: logErr } = await supabase.from("scrape_log").insert({
      story_id: storyId,
      outcome: "failure",
      error: errorMsg,
      url,
      domain,
    });
    if (logErr) console.error("[receive_scraped_content] scrape_log insert error:", logErr.message);
  }
  return json({ ok: true, story_id: storyId, skipped: true, dry_run: dryRun });
});
