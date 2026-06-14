// Supabase Edge Function: atomically claim one story and dispatch to Cloudflare Worker.
// Completion is via receive_scraped_content (callback). Stale dispatches are released in claim_stories_for_scrape.
// Optional body: { "story_id": "<uuid>" } — dispatch only that story (ignores batch claim).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SCRAPE_URL, SCRAPE_SECRET.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { recordStoryStepRun, resolveStoryStepTrigger } from "../../../lib/story-step-runs.ts";

const STEP_ID = "scrape-story-content";
const DEPLOY_NAME = "scrape_story_content";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Wait only for worker HTTP acceptance; scrape+callback may continue asynchronously. */
const WORKER_ACCEPT_TIMEOUT_MS = 15_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function parseOptionalStoryId(body: Record<string, unknown>): string | null {
  const raw = body.story_id ?? body.storyId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id) return null;
  return UUID_RE.test(id) ? id : null;
}

function domainFromUrl(urlStr: string): string {
  try {
    return new URL(urlStr.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

type StoryDispatch = { story_id: string; url: string };

async function logScrapeDispatch(
  supabase: SupabaseClient,
  storyId: string,
  singleStory: boolean,
  dryRun: boolean,
  outcome: "looping" | "failure" | "no_op" | "skipped",
  meta?: Record<string, unknown>
) {
  if (dryRun) return;
  await recordStoryStepRun(supabase, {
    storyId,
    stepId: STEP_ID,
    deployName: DEPLOY_NAME,
    outcome,
    trigger: resolveStoryStepTrigger(singleStory ? storyId : null),
    meta,
  });
}

async function dispatchToWorker(
  story: StoryDispatch,
  dryRun: boolean,
  singleStory: boolean,
  workerUrl: string,
  scrapeSecret: string,
  supabase: SupabaseClient
): Promise<Response> {
  const url = story.url.trim();
  const domain = domainFromUrl(url);
  if (!domain) {
    await logScrapeDispatch(supabase, story.story_id, singleStory, dryRun, "failure", {
      message: "Could not parse domain from URL",
    });
    return json({
      ok: true,
      dispatched: 0,
      story_id: story.story_id,
      single_story: singleStory,
      message: "Could not parse domain from URL",
    });
  }

  if (!dryRun) {
    const now = new Date();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    await supabase.from("domain_throttle").upsert(
      { domain, last_dispatched_at: now.toISOString() },
      { onConflict: "domain" }
    );
  }

  await logScrapeDispatch(supabase, story.story_id, singleStory, dryRun, "looping", {
    phase: "dispatch",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKER_ACCEPT_TIMEOUT_MS);

  try {
    const res = await fetch(`${workerUrl}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${scrapeSecret}`,
      },
      body: JSON.stringify({ url, story_id: story.story_id, dry_run: dryRun }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[scrape_story_content] Worker response:", res.status, errText.slice(0, 300));
      return json({
        ok: true,
        dispatched: 1,
        story_id: story.story_id,
        single_story: singleStory,
        worker_status: res.status,
        dry_run: dryRun,
        note: "Worker returned non-OK; dispatch left in-flight until receive or stale release",
      });
    }

    return json({
      ok: true,
      dispatched: 1,
      story_id: story.story_id,
      single_story: singleStory,
      dry_run: dryRun,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const isAbort = e instanceof Error && e.name === "AbortError";
    console.warn("[scrape_story_content] Worker request:", isAbort ? "timeout" : msg);
    return json({
      ok: true,
      dispatched: 1,
      story_id: story.story_id,
      single_story: singleStory,
      dry_run: dryRun,
      worker_timeout: isAbort,
      note: "Dispatch remains in-flight; receive or stale release will reconcile",
    });
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

  const storyIdParam =
    typeof body.story_id === "string" || typeof body.storyId === "string"
      ? body.story_id ?? body.storyId
      : undefined;
  const singleStoryId = parseOptionalStoryId(body);
  if (storyIdParam !== undefined && storyIdParam !== null && String(storyIdParam).trim() && !singleStoryId) {
    return json({ error: "Invalid story_id; expected a UUID" }, 400);
  }

  const dryRun = Boolean(body.dry_run ?? false);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let story: StoryDispatch | undefined;

  if (singleStoryId) {
    if (dryRun) {
      const { data, error } = await supabase
        .from("stories")
        .select("story_id, url")
        .eq("story_id", singleStoryId)
        .maybeSingle();
      if (error) {
        console.error("[scrape_story_content] query error:", error.message);
        return json({ error: error.message }, 500);
      }
      if (!data) {
        return json({ error: "Story not found", story_id: singleStoryId }, 404);
      }
      story = { story_id: data.story_id, url: (data.url ?? "").trim() };
    } else {
      const { data, error } = await supabase
        .from("stories")
        .update({ scrape_dispatched_at: new Date().toISOString() })
        .eq("story_id", singleStoryId)
        .select("story_id, url")
        .maybeSingle();
      if (error) {
        console.error("[scrape_story_content] claim error:", error.message);
        return json({ error: error.message }, 500);
      }
      if (!data) {
        return json({ error: "Story not found", story_id: singleStoryId }, 404);
      }
      story = { story_id: data.story_id, url: (data.url ?? "").trim() };
    }
    console.log(`[scrape_story_content] Single-story dispatch ${singleStoryId}`);
  } else {
    const { data: storiesRaw, error: rpcErr } = await supabase.rpc("claim_stories_for_scrape", {
      p_limit: 1,
      p_dry_run: dryRun,
    });

    if (rpcErr) {
      console.error("[scrape_story_content] RPC error:", rpcErr.message);
      return json({ error: rpcErr.message }, 500);
    }

    const stories = Array.isArray(storiesRaw) ? storiesRaw : [];
    const row = stories[0] as { story_id: string; url: string | null } | undefined;
    if (row?.story_id) {
      story = { story_id: row.story_id, url: (row.url ?? "").trim() };
    }
  }

  if (!story?.story_id) {
    if (!dryRun && singleStoryId) {
      await recordStoryStepRun(supabase, {
        storyId: singleStoryId,
        stepId: STEP_ID,
        deployName: DEPLOY_NAME,
        outcome: "no_op",
        trigger: resolveStoryStepTrigger(singleStoryId),
        meta: { message: "No stories ready for scrape" },
      });
    }
    return json({
      ok: true,
      dispatched: 0,
      message: "No stories ready for scrape",
      single_story: Boolean(singleStoryId),
      story_id: singleStoryId ?? undefined,
    });
  }

  if (!story.url) {
    await logScrapeDispatch(supabase, story.story_id, Boolean(singleStoryId), dryRun, "no_op", {
      message: "Story has no URL",
    });
    return json({
      ok: true,
      dispatched: 0,
      story_id: story.story_id,
      single_story: Boolean(singleStoryId),
      message: "Story has no URL",
    });
  }

  return dispatchToWorker(
    story,
    dryRun,
    Boolean(singleStoryId),
    WORKER_SCRAPE_URL,
    SCRAPE_SECRET,
    supabase
  );
};
