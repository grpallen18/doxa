// Supabase Edge Function: classify ingested stories into KEEP/DROP (cron #2).
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
// Optional: OPENAI_MODEL (default: gpt-5-nano-2025-08-07)
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY.

import { createClient } from "npm:@supabase/supabase-js@2";

type StoryRow = {
  story_id: string;
  title: string | null;
  content_snippet: string | null;
  content_full: string | null;
  url: string | null;
  created_at: string | null;
  sources: { name: string } | null;
};

type LlmScore = {
  id: string;
  score: number;
  confidence: number;
  tags: string[];
  reason: string;
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

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function truncate(s: string, maxLen: number) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

function getSourceName(sources: unknown): string {
  if (sources === null || sources === undefined) return "";
  if (typeof sources === "object" && !Array.isArray(sources) && "name" in sources) {
    const name = (sources as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function normalizeScore(d: unknown): LlmScore | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, unknown>;
  if (typeof obj.id !== "string") return null;
  const score = clampInt(obj.score, 0, 100, -1);
  const confidence = clampInt(obj.confidence, 0, 100, -1);
  if (score < 0 || confidence < 0) return null;

  const tags = Array.isArray(obj.tags)
    ? (obj.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const reason =
    typeof obj.reason === "string" ? truncate(obj.reason.trim(), 200) : "";
  if (!reason) return null;

  return { id: obj.id, score, confidence, tags, reason };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  stories: StoryRow[],
  contentMaxChars: number,
  requestId: string
): Promise<LlmScore[]> {
  const items = stories.map((s) => ({
    id: s.story_id,
    title: s.title ?? "",
    source: getSourceName(s.sources),
    url: s.url ?? "",
    snippet: s.content_snippet ?? "",
    content: truncate(s.content_full ?? "", contentMaxChars),
  }));

  const system = `You classify news stories for DOXA.

Goal: decide whether each story is broadly "politically relevant" for national/civic importance.
You are given title, snippet, source, and content (may be truncated). Do not browse.

Scoring (0-100):
- 80-100: clearly politics/governance/policy, elections, legislation, courts, war/foreign policy, major protests, major national security actions.
- 60-79: civic-impact US-related news with policy relevance: economy/macroeconomy, major natural disasters, major public health, major infrastructure, major criminal justice with national implications, major labor actions.
- 40-59: news with weak civic impact or mostly local/soft relevance.
- 0-39: celebrity/personal life, sports, entertainment, trivial lifestyle, product promo, etc.

Confidence (0-100): your certainty the score band is correct. If unsure/ambiguous, set confidence < 60.

Return JSON only in the required schema.
Tags: 1-5 short snake_case tags (e.g., election, congress, supreme_court, economy, disaster, foreign_policy, national_security, protest, regulation).
Reason: one sentence, <= 200 chars.`;

  console.log(`[relevance_gate] Calling OpenAI model=${model} stories=${items.length} requestId=${requestId}`);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-ID": requestId,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ stories: items }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doxa_relevance_gate",
          strict: true,
          schema: {
            type: "object",
            properties: {
              results: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "story_id" },
                    score: { type: "number", minimum: 0, maximum: 100 },
                    confidence: { type: "number", minimum: 0, maximum: 100 },
                    tags: {
                      type: "array",
                      items: { type: "string" },
                      maxItems: 8,
                    },
                    reason: { type: "string", maxLength: 200 },
                  },
                  required: ["id", "score", "confidence", "tags", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["results"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[relevance_gate] OpenAI API error ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  console.log(`[relevance_gate] OpenAI response OK, parsing...`);

  let data: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  try {
    data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  } catch (parseErr) {
    console.error("[relevance_gate] OpenAI response body was not valid JSON:", parseErr);
    throw new Error("OpenAI response was not valid JSON");
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    const err = data.error;
    const msg = err && typeof err === "object" && typeof err.message === "string" ? err.message : "OpenAI error in response body";
    console.error("[relevance_gate] OpenAI error in body:", msg);
    throw new Error(msg);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    console.error("[relevance_gate] Missing or non-string content in OpenAI response:", { hasData: !!data, choicesLen: data?.choices?.length });
    throw new Error("Missing OpenAI content");
  }

  let parsed: { results?: unknown[] };
  try {
    parsed = JSON.parse(content) as { results?: unknown[] };
  } catch (parseErr) {
    console.error("[relevance_gate] OpenAI content was not valid JSON (first 300 chars):", content.slice(0, 300), parseErr);
    throw new Error("OpenAI content was not valid JSON");
  }
  const raw = Array.isArray(parsed?.results) ? parsed.results : [];

  const results: LlmScore[] = [];
  for (const r of raw) {
    const nr = normalizeScore(r);
    if (nr) results.push(nr);
  }

  console.log(`[relevance_gate] Parsed ${results.length} valid results from ${raw.length} raw`);
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5-nano-2025-08-07";

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json(
      {
        error:
          "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY",
      },
      500
    );
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch (_e) {
    console.warn("[relevance_gate] Request body parse failed, using defaults");
  }

  const lookbackDays = clampInt(body.lookback_days, 1, 14, 7);
  const maxStories = clampInt(body.max_stories, 1, 2000, 10);
  const contentMaxChars = clampInt(body.content_max_chars, 0, 6000, 2500);
  const dryRun = Boolean(body.dry_run ?? false);

  const sinceIso = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { data: storiesRaw, error } = await supabase
      .from("stories")
      .select("story_id, title, content_snippet, content_full, url, created_at, sources(name)")
      .is("relevance_status", null)
      .eq("being_processed", false)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(maxStories);

    if (error) {
      console.error("[relevance_gate] Supabase query error:", error.message);
      return json({ error: error.message }, 500);
    }

    const stories = (Array.isArray(storiesRaw) ? storiesRaw : []).filter(
      (s): s is StoryRow => typeof s === "object" && s !== null && typeof (s as StoryRow).story_id === "string"
    );

    if (stories.length === 0) {
      return json({ ok: true, processed: 0, message: "No stories to classify" });
    }

    if (stories.length !== (storiesRaw?.length ?? 0)) {
      console.warn(`[relevance_gate] Dropped ${(storiesRaw?.length ?? 0) - stories.length} rows without story_id`);
    }

    const storyIds = stories.map((s) => s.story_id);

    const { error: lockErr } = await supabase
      .from("stories")
      .update({ being_processed: true })
      .in("story_id", storyIds);

    if (lockErr) {
      console.error("[relevance_gate] Lock (being_processed) error:", lockErr.message);
      return json({ error: lockErr.message }, 500);
    }

    console.log(`[relevance_gate] Locked ${stories.length} stories (lookback=${lookbackDays}d, max=${maxStories})`);

    try {
      const counts: Record<string, number> = { KEEP: 0, DROP: 0, PENDING: 0 };
      const now = new Date().toISOString();
      const requestId = `run-${Date.now()}`;

      let llmResults: LlmScore[];
      try {
        llmResults = await callOpenAI(OPENAI_API_KEY, MODEL, stories, contentMaxChars, requestId);
        console.log(`[relevance_gate] OpenAI done, got ${llmResults.length} results`);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e ?? "Unknown error");
        const stack = e instanceof Error ? e.stack : undefined;
        console.error("[relevance_gate] OpenAI failed:", errorMsg, e, stack);

        const fallback = stories.map((s) => ({
          story_id: s.story_id,
          relevance_score: null,
          relevance_confidence: 0,
          relevance_reason: `LLM call failed: ${errorMsg.slice(0, 150)}`,
          relevance_tags: ["llm_error"],
          relevance_model: MODEL,
          relevance_ran_at: now,
        }));

        if (!dryRun) {
          for (const row of fallback) {
            const { story_id, ...fields } = row;
            const { error: upErr } = await supabase
              .from("stories")
              .update(fields)
              .eq("story_id", story_id);
            if (upErr) {
              console.error("[relevance_gate] Update error:", upErr.message);
              return json({ ok: false, error: upErr.message }, 500);
            }
          }
        }

        return json({
          ok: true,
          processed: fallback.length,
          dry_run: dryRun,
          counts: { KEEP: 0, DROP: 0, PENDING: fallback.length },
          model: MODEL,
          lookback_days: lookbackDays,
          max_stories: maxStories,
          content_max_chars: contentMaxChars,
        });
      }

      const byId = new Map(llmResults.map((r) => [r.id, r]));

      const updates = stories.map((s) => {
        const r = byId.get(s.story_id);
        if (!r) {
          counts.PENDING += 1;
          return {
            story_id: s.story_id,
            relevance_score: null,
            relevance_confidence: 0,
            relevance_reason:
              "No LLM result returned; requires full-context review.",
            relevance_tags: ["missing_result"],
            relevance_model: MODEL,
            relevance_ran_at: now,
          };
        }

        const confidence = clampInt(r.confidence, 0, 100, 0);
        if (confidence < 60) {
          counts.PENDING += 1;
          return {
            story_id: s.story_id,
            relevance_score: null,
            relevance_confidence: confidence,
            relevance_reason: r.reason,
            relevance_tags: r.tags,
            relevance_model: MODEL,
            relevance_ran_at: now,
          };
        }

        const score = clampInt(r.score, 0, 100, 0);
        const status = score >= 60 ? "KEEP" : "DROP";
        counts[status] += 1;

        return {
          story_id: s.story_id,
          relevance_score: score,
          relevance_confidence: confidence,
          relevance_reason: r.reason,
          relevance_tags: r.tags,
          relevance_model: MODEL,
          relevance_ran_at: now,
        };
      });

      console.log(`[relevance_gate] Applying ${updates.length} updates`);

      if (!dryRun) {
        for (const row of updates) {
          const { story_id, ...fields } = row;
          const { error: upErr } = await supabase
            .from("stories")
            .update(fields)
            .eq("story_id", story_id);
          if (upErr) {
            console.error("[relevance_gate] Update error:", upErr.message);
            return json({ ok: false, error: upErr.message }, 500);
          }
        }
      }

      return json({
        ok: true,
        processed: updates.length,
        dry_run: dryRun,
        counts,
        model: MODEL,
        lookback_days: lookbackDays,
        max_stories: maxStories,
        content_max_chars: contentMaxChars,
      });
    } finally {
      const { error: unlockErr } = await supabase
        .from("stories")
        .update({ being_processed: false })
        .in("story_id", storyIds);
      if (unlockErr) {
        console.error("[relevance_gate] Unlock (being_processed) error:", unlockErr.message);
      }
    }
  } catch (e) {
    const errorMsg = (e instanceof Error ? e.message : String(e ?? "Unknown error")) || "Unknown error";
    console.error("[relevance_gate] Uncaught error:", errorMsg, e);
    return json({ error: errorMsg }, 500);
  }
});
