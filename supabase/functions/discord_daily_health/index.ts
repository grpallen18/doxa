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
  scrape_total_24h: number;
  scrape_successes_24h: number;
  scrape_failures_24h: number;
  stories_pending_24h: number;
}

const GREEN = 0x00ff00;
const YELLOW = 0xffaa00;
const RED = 0xff0000;

type Section = "sourcing" | "scraping" | "chunking" | "claims" | "semantics" | "backlog";

function num(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isNaN(v) ? 0 : v;
}

function getSectionColor(section: Section, row: HealthRow): number {
  switch (section) {
    case "sourcing": {
      const ingested = num(row.stories_ingested);
      const approved = num(row.stories_approved);
      const dropped = num(row.stories_dropped);
      const pending = num(row.stories_pending_24h);
      const classified = approved + dropped + pending;
      if (ingested < 200) return RED;
      if (ingested > 0 && classified < 0.9 * ingested) return RED;
      return GREEN;
    }
    case "scraping": {
      const total = num(row.scrape_total_24h);
      const successes = num(row.scrape_successes_24h);
      const failures = num(row.scrape_failures_24h);
      const completed = successes + failures;
      const rate = completed > 0 ? (successes / completed) * 100 : 100;
      if (total < 100) return RED;
      if (rate < 80) return YELLOW;
      return GREEN;
    }
    case "chunking": {
      const a = [num(row.stories_cleaned), num(row.chunks_created), num(row.chunks_extracted), num(row.merges_completed)];
      if (a.some((x) => x < 100)) return RED;
      if (a.some((x) => x >= 100 && x <= 199)) return YELLOW;
      return GREEN;
    }
    case "claims": {
      const a = [num(row.story_claims_created), num(row.claims_created), num(row.claim_relationships_24h)];
      if (a.some((x) => x < 10)) return RED;
      if (a.some((x) => x < 50)) return YELLOW;
      return GREEN;
    }
    case "semantics": {
      if (num(row.positions_active) === 0 || num(row.controversies_active) === 0) return RED;
      if (num(row.positions_24h) < 5 && num(row.controversies_24h) < 5 && num(row.viewpoints_24h) < 5) return YELLOW;
      return GREEN;
    }
    case "backlog": {
      const pending = num(row.pending_stories_count);
      const awaitingScrape = num(row.awaiting_scrape);
      const pipeline = [
        num(row.awaiting_cleaning),
        num(row.awaiting_merge),
        num(row.unclassified_stories),
        num(row.stuck_processing),
      ];
      if (pipeline.some((x) => x > 3)) return RED;
      if (pending > 100 || awaitingScrape > 200) return RED;
      if (pending >= 50 && pending <= 99) return YELLOW;
      if (awaitingScrape >= 100 && awaitingScrape <= 199) return YELLOW;
      return GREEN;
    }
    default:
      return GREEN;
  }
}

function getSectionSummary(section: Section, row: HealthRow): string {
  const color = getSectionColor(section, row);
  if (color === RED) {
    const phrases: Record<Section, string> = {
      sourcing: "Sourcing Engine has stalled. Check the pipeline.",
      scraping: "Scraping Engine is failing. Check the Worker and rate limits.",
      chunking: "Chunking Engine is stalled.",
      claims: "Claims Engine is stalled.",
      semantics: "Semantics Engine has no content. Check clustering.",
      backlog: "Backlog Engine is critical. Address soon.",
    };
    return phrases[section];
  }
  if (color === YELLOW) {
    const phrases: Record<Section, string> = {
      sourcing: "Sourcing Engine is healthy.",
      scraping: "Scraping Engine success rate could be better.",
      chunking: "Chunking Engine activity is low.",
      claims: "Claims Engine activity is low.",
      semantics: "Semantics Engine activity is low.",
      backlog: "Backlog Engine is growing.",
    };
    return phrases[section];
  }
  const phrases: Record<Section, string> = {
    sourcing: "Sourcing Engine is healthy.",
    scraping: "Scraping Engine is running smoothly.",
    chunking: "Chunking Engine is healthy.",
    claims: "Claims Engine is healthy.",
    semantics: "Semantics Engine is active.",
    backlog: "Backlog Engine is under control.",
  };
  return phrases[section];
}

function formatNum(n: unknown): string {
  if (n == null) return "0";
  const numVal = Number(n);
  return Number.isNaN(numVal) ? "0" : String(numVal);
}

function formatScrapeRate(successes: number, failures: number): string {
  const total = successes + failures;
  if (total === 0) return "N/A";
  const pct = Math.round((successes / total) * 100);
  return `${pct}%`;
}

interface ScrapeBySourceRow {
  domain: string;
  total: number;
  successes: number;
  failures: number;
}

function buildEmbeds(row: HealthRow, scrapeBySource: ScrapeBySourceRow[]): Record<string, unknown>[] {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const sourcing: Record<string, unknown> = {
    title: `Sourcing (${date})`,
    description: getSectionSummary("sourcing", row),
    color: getSectionColor("sourcing", row),
    fields: [
      { name: "Stories Ingested", value: formatNum(row.stories_ingested), inline: true },
      { name: "Approved Stories", value: formatNum(row.stories_approved), inline: true },
      { name: "Dropped Stories", value: formatNum(row.stories_dropped), inline: true },
      { name: "Pending Stories", value: formatNum(row.stories_pending_24h), inline: true },
    ],
  };

  const scrapingFields: { name: string; value: string; inline: boolean }[] = [];
  const maxSources = 20;
  for (const s of scrapeBySource.slice(0, maxSources)) {
    const rate = formatScrapeRate(s.successes, s.failures);
    scrapingFields.push({
      name: s.domain,
      value: `Scrapes: ${s.total} | Success: ${s.successes} | Fail: ${s.failures} | Rate: ${rate}`,
      inline: false,
    });
  }
  const totalSuccesses = num(row.scrape_successes_24h);
  const totalFailures = num(row.scrape_failures_24h);
  scrapingFields.push({
    name: "**Total**",
    value: `Scrapes: ${formatNum(row.scrape_total_24h)} | Success: ${totalSuccesses} | Fail: ${totalFailures} | Rate: ${formatScrapeRate(totalSuccesses, totalFailures)}`,
    inline: false,
  });
  const scraping: Record<string, unknown> = {
    title: "Scraping",
    description: getSectionSummary("scraping", row),
    color: getSectionColor("scraping", row),
    fields: scrapingFields,
  };

  const chunking: Record<string, unknown> = {
    title: "Chunking",
    description: getSectionSummary("chunking", row),
    color: getSectionColor("chunking", row),
    fields: [
      { name: "Stories Cleaned", value: formatNum(row.stories_cleaned), inline: true },
      { name: "Chunks Created", value: formatNum(row.chunks_created), inline: true },
      { name: "Chunks Extracted", value: formatNum(row.chunks_extracted), inline: true },
      { name: "Merges Completed", value: formatNum(row.merges_completed), inline: true },
    ],
  };

  const claims: Record<string, unknown> = {
    title: "Claims",
    description: getSectionSummary("claims", row),
    color: getSectionColor("claims", row),
    fields: [
      { name: "New Story Claims", value: formatNum(row.story_claims_created), inline: true },
      { name: "New Evidence", value: formatNum(row.story_evidence_created), inline: true },
      { name: "New Canonical Claims", value: formatNum(row.claims_created), inline: true },
      { name: "New Claim Pairs", value: formatNum(row.claim_relationships_24h), inline: true },
    ],
  };

  const semantics: Record<string, unknown> = {
    title: "Semantics",
    description: getSectionSummary("semantics", row),
    color: getSectionColor("semantics", row),
    fields: [
      { name: "New Positions", value: formatNum(row.positions_24h), inline: true },
      { name: "New Controversies", value: formatNum(row.controversies_24h), inline: true },
      { name: "New Viewpoints", value: formatNum(row.viewpoints_24h), inline: true },
      { name: "Total Positions (Active)", value: formatNum(row.positions_active), inline: true },
      { name: "Total Controversies (Active)", value: formatNum(row.controversies_active), inline: true },
      { name: "Total Viewpoints (Active)", value: formatNum(row.viewpoints_active), inline: true },
    ],
  };

  const backlog: Record<string, unknown> = {
    title: "Backlog",
    description: getSectionSummary("backlog", row),
    color: getSectionColor("backlog", row),
    fields: [
      { name: "Pending Stories", value: formatNum(row.pending_stories_count), inline: true },
      { name: "Awaiting Scrape", value: formatNum(row.awaiting_scrape), inline: true },
      { name: "Awaiting Clean", value: formatNum(row.awaiting_cleaning), inline: true },
      { name: "Awaiting Merge", value: formatNum(row.awaiting_merge), inline: true },
      { name: "Unclassified", value: formatNum(row.unclassified_stories), inline: true },
      { name: "Stuck Processing", value: formatNum(row.stuck_processing), inline: true },
    ],
  };

  return [sourcing, scraping, chunking, claims, semantics, backlog];
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
  let content: string | undefined;
  if (isTest) {
    embeds = [{
      title: "Doxa Test",
      description: "Webhook test successful.",
      color: 0x3498db,
    }];
    content = "All good — webhook test passed!";
  } else {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: row, error: healthError }, { data: scrapeBySource, error: scrapeError }] = await Promise.all([
      supabase.rpc("get_daily_health_report").single(),
      supabase.rpc("get_scrape_stats_by_source"),
    ]);

    if (healthError) {
      console.error("[discord_daily_health] RPC error:", healthError.message);
      return jsonResponse({ error: healthError.message }, 500);
    }

    if (!row) {
      return jsonResponse({ error: "No data from get_daily_health_report" }, 500);
    }

    const sourceRows: ScrapeBySourceRow[] = (scrapeBySource ?? []).map((r: { domain: string; total: unknown; successes: unknown; failures: unknown }) => ({
      domain: r.domain ?? "unknown",
      total: num(r.total),
      successes: num(r.successes),
      failures: num(r.failures),
    }));
    if (scrapeError) {
      console.warn("[discord_daily_health] get_scrape_stats_by_source error:", scrapeError.message);
    }

    embeds = buildEmbeds(row as HealthRow, sourceRows);
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    content = `Daily Health Check (${date})`;
  }

  const payload: Record<string, unknown> = { embeds };
  if (content) payload.content = content;
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
