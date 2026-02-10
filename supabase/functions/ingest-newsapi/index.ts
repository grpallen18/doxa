// Supabase Edge Function: fetch NewsAPI everything (last 48h, en), upsert sources and stories (by URL).
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Cron runs daily.
// Secrets: NEWSAPI_API_KEY (set in Dashboard or supabase secrets set).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewsAPIArticle {
  source?: { id?: string; name?: string };
  author?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults?: number;
  code?: string;
  message?: string;
  articles?: NewsAPIArticle[];
}

const NEWSAPI_SOURCES_WHITELIST = [
  "reuters",
  "associated-press",
  "the-wall-street-journal",
  "the-washington-post",
  "politico",
  "fox-news",
  "cnn",
  "msnbc",
  "national-review",
  "the-huffington-post",
  "breitbart-news",
  "the-hill",
  "the-washington-times",
  "vice-news",
  "bloomberg",
  "axios",
  "time",
  "newsweek",
  "usa-today",
  "cbs-news",
];

const SOURCES_BATCH_SIZE = 4;
const PAGE_SIZE = 100;
const EXISTING_URLS_CHUNK_SIZE = 100;

function normalizeStoryUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  u = u.replace(/\/+$/, "");
  try {
    u = encodeURI(decodeURI(u));
  } catch {
    // leave as-is if decode/encode fails
  }
  return u;
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

  const apiKey = Deno.env.get("NEWSAPI_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "NEWSAPI_API_KEY is not set. Set it in Supabase Edge Function secrets." },
      500
    );
  }

  let dryRun = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean };
    dryRun = Boolean(body?.dry_run ?? false);
  } catch {
    // use default
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let runId: string | null = null;
  let sourcesInserted = 0;
  let storiesInserted = 0;

  try {
    if (!dryRun) {
      const { data: runData, error: runInsertError } = await supabase
        .from("pipeline_runs")
        .insert({
          pipeline_name: "ingest_newsapi",
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("run_id")
        .single();

      if (!runInsertError && runData?.run_id) {
        runId = runData.run_id;
      }
    }

    const now = new Date();
    const fromDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const toIso = now.toISOString();
    const fromIso = fromDate.toISOString();

    const batches: string[][] = [];
    for (let i = 0; i < NEWSAPI_SOURCES_WHITELIST.length; i += SOURCES_BATCH_SIZE) {
      batches.push(NEWSAPI_SOURCES_WHITELIST.slice(i, i + SOURCES_BATCH_SIZE));
    }

    const allArticles: NewsAPIArticle[] = [];
    const seenUrls = new Set<string>();

    for (const batch of batches) {
      const sourcesParam = batch.join(",");
      const params = new URLSearchParams({
        sources: sourcesParam,
        language: "en",
        pageSize: String(PAGE_SIZE),
        page: "1",
        from: fromIso,
        to: toIso,
        apiKey: apiKey,
      });
      const url = `https://newsapi.org/v2/everything?${params.toString()}`;
      const res = await fetch(url);
      const data: NewsAPIResponse = await res.json();

      if (data.status !== "ok") {
        const message = data.message ?? "NewsAPI request failed";
        if (!dryRun && runId) {
          await supabase
            .from("pipeline_runs")
            .update({ status: "failed", ended_at: new Date().toISOString(), error: message })
            .eq("run_id", runId);
        }
        return jsonResponse({ error: message, code: data.code }, 502);
      }

      const pageArticles = data.articles ?? [];
      for (const a of pageArticles) {
        const u = (a.url ?? "").trim();
        if (u && u.startsWith("http") && !seenUrls.has(u)) {
          seenUrls.add(u);
          allArticles.push(a);
        }
      }
    }

    const articles = allArticles;
    const storiesFromApi = articles.length;
    const seenSourceNames = new Set<string>();
    const sourceNameToId = new Map<string, string>();

    for (const a of articles) {
      const name = (a.source?.name ?? "Unknown").trim();
      if (!name) continue;
      seenSourceNames.add(name);
    }

    const namesList = [...seenSourceNames];
    if (namesList.length > 0) {
      const { data: existingSources } = await supabase
        .from("sources")
        .select("source_id, name")
        .in("name", namesList);
      for (const row of existingSources ?? []) {
        if (row?.name && row?.source_id) sourceNameToId.set(row.name, row.source_id);
      }
      const toInsert = namesList.filter((n) => !sourceNameToId.has(n));
      if (!dryRun) {
        for (const name of toInsert) {
          const { data: inserted, error: insertErr } = await supabase
            .from("sources")
            .insert({ name, domain: null, bias_tags: [], metadata: {} })
            .select("source_id")
            .single();
          if (!insertErr && inserted?.source_id) {
            sourceNameToId.set(name, inserted.source_id);
            sourcesInserted++;
          }
        }
      } else {
        for (const name of toInsert) {
          sourceNameToId.set(name, "00000000-0000-0000-0000-000000000000");
          sourcesInserted++;
        }
      }
    }

    const existingUrls = new Set<string>();
    const articleUrls = articles
      .map((a) => normalizeStoryUrl((a.url ?? "").trim()))
      .filter((u) => u && u.startsWith("http"));
    if (articleUrls.length > 0) {
      for (let i = 0; i < articleUrls.length; i += EXISTING_URLS_CHUNK_SIZE) {
        const chunk = articleUrls.slice(i, i + EXISTING_URLS_CHUNK_SIZE);
        const { data: existing } = await supabase
          .from("stories")
          .select("url")
          .in("url", chunk);
        for (const row of existing ?? []) {
          if (row?.url) existingUrls.add(normalizeStoryUrl(row.url));
        }
      }
    }

    const storiesPayload: Array<{
      source_id: string;
      url: string;
      title: string;
      author: string | null;
      published_at: string | null;
      fetched_at: string;
      content_snippet: string | null;
      content_full: string | null;
      language: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const a of articles) {
      const url = normalizeStoryUrl((a.url ?? "").trim());
      const title = (a.title ?? "").trim();
      if (!url || !title || !url.startsWith("http")) continue;
      if (existingUrls.has(url)) continue;

      const sourceName = (a.source?.name ?? "Unknown").trim();
      const sourceId = sourceNameToId.get(sourceName);
      if (!sourceId) continue;

      let publishedAt: string | null = null;
      if (a.publishedAt) {
        const d = new Date(a.publishedAt);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      }

      storiesPayload.push({
        source_id: sourceId,
        url,
        title,
        author: a.author?.trim() ?? null,
        published_at: publishedAt,
        fetched_at: new Date().toISOString(),
        content_snippet: a.description?.trim() ?? null,
        content_full: a.content?.trim() ?? null,
        language: "en",
        metadata: a.source?.id ? { newsapi: { sourceId: a.source.id } } : {},
      });
      existingUrls.add(url);
    }

    if (storiesPayload.length > 0 && !dryRun) {
      const { error: storiesErr } = await supabase
        .from("stories")
        .upsert(storiesPayload, { onConflict: "url", ignoreDuplicates: true });
      if (!storiesErr) {
        storiesInserted = storiesPayload.length;
      }
    } else if (dryRun && storiesPayload.length > 0) {
      storiesInserted = storiesPayload.length;
    }

    if (!dryRun && runId) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "success",
          ended_at: new Date().toISOString(),
          counts: { sources_inserted: sourcesInserted, stories_inserted: storiesInserted },
        })
        .eq("run_id", runId);
    }

    return jsonResponse({
      stories_from_api: storiesFromApi,
      inserted_sources: sourcesInserted,
      inserted_stories: storiesInserted,
      pipeline_run_id: runId ?? undefined,
      dry_run: dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun && runId) {
      await supabase
        .from("pipeline_runs")
        .update({ status: "failed", ended_at: new Date().toISOString(), error: message })
        .eq("run_id", runId);
    }
    return jsonResponse({ error: message }, 500);
  }
});
