// Supabase Edge Function: fetch NewsAPI top-headlines, upsert sources and stories (by URL).
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let runId: string | null = null;
  let sourcesInserted = 0;
  let storiesInserted = 0;

  try {
    // Optional: create pipeline_run for audit
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

    const url = `https://newsapi.org/v2/top-headlines?country=us&category=politics&language=en&pageSize=100&page=1&apiKey=${apiKey}`;
    const res = await fetch(url);
    const data: NewsAPIResponse = await res.json();

    if (data.status !== "ok") {
      const message = data.message ?? "NewsAPI request failed";
      if (runId) {
        await supabase
          .from("pipeline_runs")
          .update({ status: "failed", ended_at: new Date().toISOString(), error: message })
          .eq("run_id", runId);
      }
      return jsonResponse({ error: message, code: data.code }, 502);
    }

    const articles = data.articles ?? [];
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
    }

    const existingUrls = new Set<string>();
    const articleUrls = articles
      .map((a) => (a.url ?? "").trim())
      .filter((u) => u && u.startsWith("http"));
    if (articleUrls.length > 0) {
      const { data: existing } = await supabase
        .from("stories")
        .select("url")
        .in("url", articleUrls);
      for (const row of existing ?? []) {
        if (row?.url) existingUrls.add(row.url);
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
      const url = (a.url ?? "").trim();
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

    if (storiesPayload.length > 0) {
      const { error: storiesErr } = await supabase
        .from("stories")
        .upsert(storiesPayload, { onConflict: "url", ignoreDuplicates: true });
      if (!storiesErr) {
        storiesInserted = storiesPayload.length;
      }
    }

    if (runId) {
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
      inserted_sources: sourcesInserted,
      inserted_stories: storiesInserted,
      pipeline_run_id: runId ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      await supabase
        .from("pipeline_runs")
        .update({ status: "failed", ended_at: new Date().toISOString(), error: message })
        .eq("run_id", runId);
    }
    return jsonResponse({ error: message }, 500);
  }
});
