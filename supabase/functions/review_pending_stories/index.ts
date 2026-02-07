// Supabase Edge Function: re-review PENDING stories using full body content from story_bodies.
// Sends first 3000 chars of body to LLM. If confidence >= 60 writes LLM result; else writes template DROP.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { lookback_days?, max_stories?, dry_run? }.

import { createClient } from "npm:@supabase/supabase-js@2";

const BODY_CONTENT_MAX_CHARS = 3000;

type StoryRow = {
  story_id: string;
  title: string | null;
  content_snippet: string | null;
  content_full: string | null;
  url: string | null;
  created_at: string | null;
  sources: { name: string } | null;
  body_content?: string | null;
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
    ? (obj.tags as unknown[]).filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 8)
    : [];
  const reason = typeof obj.reason === "string" ? truncate(obj.reason.trim(), 200) : "";
  if (!reason) return null;
  return { id: obj.id, score, confidence, tags, reason };
}

const RELEVANCE_SYSTEM_PROMPT = `"You classify news stories for DOXA, a U.S.-centric system that filters news for national political and civic relevance to American audiences."

Audience: U.S. residents. Judge relevance from the perspective of a typical U.S. citizen.

Goal: decide whether each story is broadly "politically relevant" to U.S. national or civic life.

Geographic relevance rules (apply first):
- U.S. domestic politics, policy, elections, courts, or governance → eligible.
- Foreign events → ONLY eligible if they have clear, direct impact on the U.S.
  (e.g., U.S. foreign policy, trade, military involvement, major allies, global
   economic impact, national security, immigration, energy markets).
- Foreign domestic politics with no clear U.S. impact (e.g., routine policy
  changes, elections, or legislation in other countries) → score ≤ 40.

Scoring (0-100):
- 80-100: U.S. politics/governance/policy, elections, legislation, courts,
  war/foreign policy involving the U.S., major protests with national impact.
- 60-79: U.S.-relevant civic impact: economy/macroeconomy, major disasters,
  public health, infrastructure, criminal justice with national implications,
  major labor actions.
- 40-59: weak or indirect U.S. civic relevance.
- 0-39: non-civic content OR foreign domestic politics without direct U.S. impact.

Confidence (0-100): your certainty the score band is correct. Confidence scores < 60 are considered ambiguous.

Return JSON only in the required schema.
Tags: 1-5 short snake_case tags. Reason: one sentence, <= 200 chars.`;

async function callOpenAI(
  apiKey: string,
  model: string,
  stories: StoryRow[],
  requestId: string
): Promise<LlmScore[]> {
  const items = stories.map((s) => ({
    id: s.story_id,
    title: s.title ?? "",
    source: getSourceName(s.sources),
    url: s.url ?? "",
    snippet: s.content_snippet ?? "",
    content: truncate((s.body_content ?? s.content_full ?? "").trim(), BODY_CONTENT_MAX_CHARS),
  }));

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
        { role: "system", content: RELEVANCE_SYSTEM_PROMPT },
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
                    tags: { type: "array", items: { type: "string" }, maxItems: 8 },
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
    console.error(`[review_pending_stories] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(content) as { results?: unknown[] };
  const raw = Array.isArray(parsed?.results) ? parsed.results : [];
  const results: LlmScore[] = [];
  for (const r of raw) {
    const nr = normalizeScore(r);
    if (nr) results.push(nr);
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" }, 500);
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
  const lookbackDays = clampInt(body.lookback_days, 1, 14, 7);
  const maxStories = clampInt(body.max_stories, 1, 50, 10);
  const dryRun = Boolean(body.dry_run ?? false);

  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: bodiesRows } = await supabase
    .from("story_bodies")
    .select("story_id, content")
    .not("content", "is", null);

  const storyIdsWithBody = (Array.isArray(bodiesRows) ? bodiesRows : []).map(
    (r: { story_id: string }) => r.story_id
  );
  const bodyContentMap = new Map<string, string>(
    (Array.isArray(bodiesRows) ? bodiesRows : []).map((r: { story_id: string; content: string | null }) => [
      r.story_id,
      (r.content ?? "").trim(),
    ])
  );

  if (storyIdsWithBody.length === 0) {
    return json({ ok: true, processed: 0, message: "No story_bodies with content" });
  }

  const uniqueIds = [...new Set(storyIdsWithBody)];

  const { data: storiesRaw, error } = await supabase
    .from("stories")
    .select("story_id, title, content_snippet, content_full, url, created_at, sources(name)")
    .eq("relevance_status", "PENDING")
    .eq("being_processed", false)
    .gte("created_at", sinceIso)
    .in("story_id", uniqueIds)
    .order("created_at", { ascending: true })
    .limit(maxStories);

  if (error) {
    console.error("[review_pending_stories] Stories query error:", error.message);
    return json({ error: error.message }, 500);
  }

  const stories = (Array.isArray(storiesRaw) ? storiesRaw : []).filter(
    (s): s is StoryRow => typeof s === "object" && s !== null && typeof (s as StoryRow).story_id === "string"
  );

  for (const s of stories) {
    (s as StoryRow).body_content = bodyContentMap.get(s.story_id) ?? null;
  }

  if (stories.length === 0) {
    return json({ ok: true, processed: 0, message: "No PENDING stories with body content to review" });
  }

  const storyIds = stories.map((s) => s.story_id);

  const { error: lockErr } = await supabase.from("stories").update({ being_processed: true }).in("story_id", storyIds);
  if (lockErr) {
    console.error("[review_pending_stories] Lock error:", lockErr.message);
    return json({ error: lockErr.message }, 500);
  }

  const counts = { KEEP: 0, DROP: 0, dropped_unclear: 0 };
  const requestId = `review-pending-${Date.now()}`;
  const now = new Date().toISOString();
  const TEMPLATE_REASON = "Relevance unclear after thorough review, choosing to drop.";

  try {
    const llmResults = await callOpenAI(OPENAI_API_KEY, MODEL, stories, requestId);
    const byId = new Map(llmResults.map((r) => [r.id, r]));

    for (const s of stories) {
      const r = byId.get(s.story_id);
      const confidence = r ? clampInt(r.confidence, 0, 100, 0) : 0;
      const score = r ? clampInt(r.score, 0, 100, 0) : 0;

      if (confidence >= 60) {
        if (score >= 75) counts.KEEP += 1;
        else counts.DROP += 1;
        if (!dryRun && r) {
          await supabase
            .from("stories")
            .update({
              relevance_score: score,
              relevance_confidence: confidence,
              relevance_reason: r.reason,
              relevance_tags: r.tags,
              relevance_model: MODEL,
              relevance_ran_at: now,
            })
            .eq("story_id", s.story_id);
        }
      } else {
        counts.dropped_unclear += 1;
        if (!dryRun) {
          await supabase
            .from("stories")
            .update({
              relevance_score: 0,
              relevance_confidence: 100,
              relevance_reason: TEMPLATE_REASON,
              relevance_tags: ["unclear_after_review"],
              relevance_model: MODEL,
              relevance_ran_at: now,
            })
            .eq("story_id", s.story_id);
        }
      }
    }

    return json({
      ok: true,
      processed: stories.length,
      counts,
      dry_run: dryRun,
      model: MODEL,
      lookback_days: lookbackDays,
      max_stories: maxStories,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[review_pending_stories] Error:", msg);
    return json({ error: msg }, 500);
  } finally {
    const { error: unlockErr } = await supabase
      .from("stories")
      .update({ being_processed: false })
      .in("story_id", storyIds);
    if (unlockErr) console.error("[review_pending_stories] Unlock error:", unlockErr.message);
  }
});
