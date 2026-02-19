// Supabase Edge Function: fetch daily health report and POST to Discord webhook.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Cron runs daily.
// Secrets: DISCORD_WEBHOOK (set in Dashboard or supabase secrets set).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthRow {
  stories_ingested: number;
  stories_approved: number;
  stories_dropped: number;
  stories_scraped: number;
  stories_cleaned: number;
  pending_stories_count: number;
  chunks_created: number;
  chunks_extracted: number;
  merges_completed: number;
  story_claims_created: number;
  story_evidence_created: number;
  claims_created: number;
  awaiting_scrape: number;
  awaiting_cleaning: number;
  awaiting_merge: number;
  unclassified_stories: number;
  scrape_failed: number;
  stuck_processing: number;
  claim_relationships_24h: number;
  positions_24h: number;
  controversies_24h: number;
  viewpoints_24h: number;
  positions_active: number;
  controversies_active: number;
  viewpoints_active: number;
}

const GREEN = 0x00ff00;
const YELLOW = 0xffaa00;
const RED = 0xff0000;

function getHealthColor(row: HealthRow): number {
  const stuck = Number(row.stuck_processing ?? 0);
  const pending = Number(row.pending_stories_count ?? 0);
  const awaitingScrape = Number(row.awaiting_scrape ?? 0);
  const scrapeFailed = Number(row.scrape_failed ?? 0);
  if (stuck > 0) return RED;
  if (pending > 100 || awaitingScrape > 50 || scrapeFailed > 5) return YELLOW;
  return GREEN;
}

function formatNum(n: unknown): string {
  if (n == null) return "0";
  const num = Number(n);
  return Number.isNaN(num) ? "0" : String(num);
}

function buildEmbeds(row: HealthRow): Record<string, unknown>[] {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const color = getHealthColor(row);

  const pipeline: Record<string, unknown> = {
    title: "Pipeline (24h)",
    description: date,
    color,
    fields: [
      { name: "Stories Ingested", value: formatNum(row.stories_ingested), inline: true },
      { name: "Stories Approved", value: formatNum(row.stories_approved), inline: true },
      { name: "Stories Dropped", value: formatNum(row.stories_dropped), inline: true },
      { name: "Scrape Successes", value: formatNum(row.stories_scraped), inline: true },
      { name: "Scrape Failures", value: formatNum(row.scrape_failed), inline: true },
      { name: "Stories Cleaned", value: formatNum(row.stories_cleaned), inline: true },
      { name: "Chunks Created", value: formatNum(row.chunks_created), inline: true },
      { name: "Chunks Extracted", value: formatNum(row.chunks_extracted), inline: true },
      { name: "Merges Completed", value: formatNum(row.merges_completed), inline: true },
      { name: "Story Claims", value: formatNum(row.story_claims_created), inline: true },
      { name: "Claims Created", value: formatNum(row.claims_created), inline: true },
    ],
  };

  const backlogs: Record<string, unknown> = {
    title: "Backlogs",
    color,
    fields: [
      { name: "Pending", value: formatNum(row.pending_stories_count), inline: true },
      { name: "Awaiting Scrape", value: formatNum(row.awaiting_scrape), inline: true },
      { name: "Awaiting Clean", value: formatNum(row.awaiting_cleaning), inline: true },
      { name: "Awaiting Merge", value: formatNum(row.awaiting_merge), inline: true },
      { name: "Unclassified", value: formatNum(row.unclassified_stories), inline: true },
    ],
  };

  const health: Record<string, unknown> = {
    title: "Health",
    color,
    fields: [
      { name: "Stuck Processing", value: formatNum(row.stuck_processing), inline: true },
    ],
  };

  const clustering: Record<string, unknown> = {
    title: "Clustering",
    color,
    fields: [
      { name: "Claim Pairs (24h)", value: formatNum(row.claim_relationships_24h), inline: true },
      { name: "Positions (24h)", value: formatNum(row.positions_24h), inline: true },
      { name: "Controversies (24h)", value: formatNum(row.controversies_24h), inline: true },
      { name: "Viewpoints (24h)", value: formatNum(row.viewpoints_24h), inline: true },
      { name: "Positions Active", value: formatNum(row.positions_active), inline: true },
      { name: "Controversies Active", value: formatNum(row.controversies_active), inline: true },
      { name: "Viewpoints Active", value: formatNum(row.viewpoints_active), inline: true },
    ],
  };

  return [pipeline, backlogs, health, clustering];
}

function jsonResponse(body: object, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...headers },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK")?.trim();
  if (!webhookUrl) {
    return jsonResponse(
      { error: "DISCORD_WEBHOOK is not set. Set it in Supabase Edge Function secrets." },
      500
    );
  }

  let isTest = false;
  try {
    const url = new URL(req.url);
    isTest = url.searchParams.get("test") === "1" || url.searchParams.get("test") === "true";
  } catch {
    // ignore
  }
  if (!isTest) {
    try {
      const body = (await req.clone().json().catch(() => ({}))) as { test?: boolean };
      isTest = body?.test === true;
    } catch {
      // ignore
    }
  }

  let embeds: Record<string, unknown>[];
  if (isTest) {
    embeds = [{
      title: "Doxa Test",
      description: "Webhook test successful.",
      color: 0x3498db,
    }];
  } else {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: row, error } = await supabase
      .rpc("get_daily_health_report")
      .single();

    if (error) {
      console.error("[discord_daily_health] RPC error:", error.message);
      return jsonResponse({ error: error.message }, 500);
    }

    if (!row) {
      return jsonResponse({ error: "No data from get_daily_health_report" }, 500);
    }

    embeds = buildEmbeds(row as HealthRow);
  }

  const payload: Record<string, unknown> = { embeds };
  const threadName = Deno.env.get("DISCORD_THREAD_NAME")?.trim();
  if (threadName) {
    payload.thread_name = threadName;
  }

  const discordRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!discordRes.ok) {
    const errText = await discordRes.text();
    console.error("[discord_daily_health] Discord webhook error:", discordRes.status, errText);
    let discordError: unknown = errText;
    try {
      discordError = JSON.parse(errText);
    } catch {
      // keep as string
    }
    return jsonResponse(
      {
        error: `Discord webhook failed: ${discordRes.status}`,
        discord_response: discordError,
        hint: "If your channel is a forum, set DISCORD_THREAD_NAME in secrets.",
      },
      500
    );
  }

  return jsonResponse({ ok: true }, 200);
});
