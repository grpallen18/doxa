// Supabase Edge Function: classify ingested stories into KEEP/DROP (cron #2).
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
// Optional: OPENAI_MODEL (default: gpt-5-nano-2025-08-07)
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY.
// Optional body: { "story_id": "<uuid>" } — classify only that story (ignores lookback/max_stories).

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  recordStoryStepRun,
  recordStoryStepRunsForBatch,
  resolveStoryStepTrigger,
} from "../../../lib/story-step-runs.ts";

const STEP_ID = "relevance-gate";
const DEPLOY_NAME = "relevance_gate";

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOptionalStoryId(body: Record<string, unknown>): string | null {
  const raw = body.story_id ?? body.storyId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id) return null;
  return UUID_RE.test(id) ? id : null;
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

  const system = `“You classify news stories for DOXA, a U.S.-centric system that filters news for national political and civic relevance to American audiences.”

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

Confidence (0-100): your certainty the score band is correct. Confidence scores < 60 are considered ambiguous and will trigger more detailed reviews.

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

export const handler = async (req: Request) => {
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

  const storyIdParam =
    typeof body.story_id === "string" || typeof body.storyId === "string"
      ? body.story_id ?? body.storyId
      : undefined;
  const singleStoryId = parseOptionalStoryId(body);
  if (storyIdParam !== undefined && storyIdParam !== null && String(storyIdParam).trim() && !singleStoryId) {
    return json({ error: "Invalid story_id; expected a UUID" }, 400);
  }

  const lookbackDays = clampInt(body.lookback_days, 1, 14, 7);
  const maxStories = clampInt(body.max_stories, 1, 2000, 10);
  const contentMaxChars = clampInt(body.content_max_chars, 0, 6000, 2500);
  const dryRun = Boolean(body.dry_run ?? false);

  const sinceIso = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let claimedStoryIds: string[] = [];

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    let noUrlDropped = 0;
    if (!dryRun && !singleStoryId) {
      const { data: noUrlCount, error: noUrlErr } = await supabase.rpc("mark_no_url_stories_unclassified", {
        p_since: sinceIso,
      });
      if (noUrlErr) {
        console.error("[relevance_gate] mark_no_url error:", noUrlErr.message);
        return json({ error: noUrlErr.message }, 500);
      }
      noUrlDropped = typeof noUrlCount === "number" ? noUrlCount : 0;
      if (noUrlDropped > 0) {
        console.log(`[relevance_gate] Marked ${noUrlDropped} no-URL stories as DROP`);
      }
    }

    type ClaimedRow = {
      story_id: string;
      title: string | null;
      content_snippet: string | null;
      content_full: string | null;
      url: string | null;
      created_at: string | null;
      source_name: string | null;
    };

    const storySelect =
      "story_id, title, content_snippet, content_full, url, created_at, sources(name)";

    function rowToClaimed(r: StoryRow & { sources?: { name: string } | null }): ClaimedRow {
      return {
        story_id: r.story_id,
        title: r.title,
        content_snippet: r.content_snippet,
        content_full: r.content_full,
        url: r.url,
        created_at: r.created_at,
        source_name: getSourceName(r.sources),
      };
    }

    let claimedRaw: ClaimedRow[] | null = null;

    if (singleStoryId) {
      const { data: row, error: fetchErr } = await supabase
        .from("stories")
        .select(storySelect)
        .eq("story_id", singleStoryId)
        .maybeSingle();
      if (fetchErr) {
        console.error("[relevance_gate] Supabase query error:", fetchErr.message);
        return json({ error: fetchErr.message }, 500);
      }
      if (!row) {
        return json({ error: "Story not found", story_id: singleStoryId }, 404);
      }

      const storyRow = row as StoryRow & { sources?: { name: string } | null };
      const url = (storyRow.url ?? "").trim();
      if (!url) {
        const now = new Date().toISOString();
        const noUrlUpdate = {
          relevance_score: 0,
          relevance_confidence: 100,
          relevance_reason: "No URL; cannot scrape.",
          relevance_tags: ["no_url"],
          relevance_model: "system",
          relevance_ran_at: now,
          relevance_claimed_at: null,
          scrape_skipped: true,
          scrape_skipped_at: now,
        };
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("stories")
            .update(noUrlUpdate)
            .eq("story_id", singleStoryId);
          if (upErr) {
            console.error("[relevance_gate] Update error:", upErr.message);
            return json({ error: upErr.message }, 500);
          }
        }
        return json({
          ok: true,
          processed: 1,
          story_id: singleStoryId,
          single_story: true,
          dry_run: dryRun,
          counts: { KEEP: 0, DROP: 1, PENDING: 0 },
          no_url_dropped: 1,
          message: "Story has no URL; marked DROP",
        });
      }

      if (dryRun) {
        claimedRaw = [rowToClaimed(storyRow)];
      } else {
        const { data: claimed, error: claimErr } = await supabase
          .from("stories")
          .update({ relevance_claimed_at: new Date().toISOString() })
          .eq("story_id", singleStoryId)
          .select(storySelect)
          .maybeSingle();
        if (claimErr) {
          console.error("[relevance_gate] claim story error:", claimErr.message);
          return json({ error: claimErr.message }, 500);
        }
        if (!claimed) {
          return json({ error: "Story not found", story_id: singleStoryId }, 404);
        }
        claimedRaw = [rowToClaimed(claimed as StoryRow & { sources?: { name: string } | null })];
      }
    } else if (dryRun) {
      const { data, error } = await supabase
        .from("stories")
        .select(storySelect)
        .is("relevance_status", null)
        .is("relevance_claimed_at", null)
        .gte("created_at", sinceIso)
        .not("url", "is", null)
        .neq("url", "")
        .order("created_at", { ascending: true })
        .limit(maxStories);
      if (error) {
        console.error("[relevance_gate] Supabase query error:", error.message);
        return json({ error: error.message }, 500);
      }
      claimedRaw = (Array.isArray(data) ? data : []).map((row) =>
        rowToClaimed(row as StoryRow & { sources?: { name: string } | null })
      );
    } else {
      const { data, error } = await supabase.rpc("claim_stories_for_relevance", {
        p_since: sinceIso,
        p_limit: maxStories,
      });
      if (error) {
        console.error("[relevance_gate] claim_stories_for_relevance error:", error.message);
        return json({ error: error.message }, 500);
      }
      claimedRaw = Array.isArray(data) ? (data as ClaimedRow[]) : [];
    }

    const stories: StoryRow[] = (claimedRaw ?? [])
      .filter((r) => typeof r.story_id === "string")
      .map((r) => ({
        story_id: r.story_id,
        title: r.title,
        content_snippet: r.content_snippet,
        content_full: r.content_full,
        url: r.url,
        created_at: r.created_at,
        sources: r.source_name ? { name: r.source_name } : null,
      }));

    if (stories.length === 0) {
      if (!dryRun && singleStoryId) {
        await recordStoryStepRun(supabase, {
          storyId: singleStoryId,
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          outcome: "no_op",
          trigger: resolveStoryStepTrigger(singleStoryId),
          meta: { message: "No stories to classify" },
        });
      }
      return json({
        ok: true,
        processed: noUrlDropped,
        message: "No stories to classify",
        no_url_dropped: noUrlDropped,
        dry_run: dryRun,
        single_story: Boolean(singleStoryId),
        story_id: singleStoryId ?? undefined,
      });
    }

    claimedStoryIds = stories.map((s) => s.story_id);
    if (singleStoryId) {
      console.log(`[relevance_gate] Classifying single story ${singleStoryId}`);
    } else {
      console.log(`[relevance_gate] Claimed ${stories.length} stories (lookback=${lookbackDays}d, max=${maxStories})`);
    }

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
          relevance_claimed_at: null,
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
          await recordStoryStepRunsForBatch(
            supabase,
            {
              stepId: STEP_ID,
              deployName: DEPLOY_NAME,
              trigger: resolveStoryStepTrigger(singleStoryId),
            },
            fallback.map((row) => ({
              storyId: row.story_id,
              processed: 1,
              chunkIndices: [],
              blocked: true,
              modelName: MODEL,
            }))
          );
        }

        return json({
          ok: true,
          processed: fallback.length + noUrlDropped,
          dry_run: dryRun,
          counts: { KEEP: 0, DROP: noUrlDropped, PENDING: fallback.length },
          no_url_dropped: noUrlDropped,
          model: MODEL,
          lookback_days: lookbackDays,
          max_stories: maxStories,
          content_max_chars: contentMaxChars,
          single_story: Boolean(singleStoryId),
          story_id: singleStoryId ?? undefined,
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
            relevance_claimed_at: null,
          };
        }

        const confidence = clampInt(r.confidence, 0, 100, 0);
        const score = clampInt(r.score, 0, 100, 0);
        if (confidence >= 60) {
          const status = score >= 50 ? "KEEP" : "DROP";
          counts[status] += 1;
        } else {
          if (score >= 50) counts.PENDING += 1;
          else counts.DROP += 1;
        }

        return {
          story_id: s.story_id,
          relevance_score: score,
          relevance_confidence: confidence,
          relevance_reason: r.reason,
          relevance_tags: r.tags,
          relevance_model: MODEL,
          relevance_ran_at: now,
          relevance_claimed_at: null,
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
        await recordStoryStepRunsForBatch(
          supabase,
          {
            stepId: STEP_ID,
            deployName: DEPLOY_NAME,
            trigger: resolveStoryStepTrigger(singleStoryId),
          },
          updates.map((row) => ({
            storyId: row.story_id,
            processed: 1,
            chunkIndices: [],
            stepComplete: true,
            modelName: MODEL,
          }))
        );
      }

      const totalProcessed = updates.length + noUrlDropped;
      const finalCounts = {
        ...counts,
        DROP: counts.DROP + noUrlDropped,
      };

      return json({
        ok: true,
        processed: totalProcessed,
        dry_run: dryRun,
        counts: finalCounts,
        no_url_dropped: noUrlDropped,
        model: MODEL,
        lookback_days: lookbackDays,
        max_stories: maxStories,
        content_max_chars: contentMaxChars,
        single_story: Boolean(singleStoryId),
        story_id: singleStoryId ?? undefined,
      });
  } catch (e) {
    const errorMsg = (e instanceof Error ? e.message : String(e ?? "Unknown error")) || "Unknown error";
    console.error("[relevance_gate] Uncaught error:", errorMsg, e);
    if (!dryRun && claimedStoryIds.length > 0) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
      await supabase.from("stories").update({ relevance_claimed_at: null }).in("story_id", claimedStoryIds);
      await recordStoryStepRunsForBatch(
        supabase,
        {
          stepId: STEP_ID,
          deployName: DEPLOY_NAME,
          trigger: resolveStoryStepTrigger(singleStoryId),
        },
        claimedStoryIds.map((storyId) => ({
          storyId,
          processed: 0,
          chunkIndices: [],
          error: errorMsg,
        }))
      );
    }
    return json({ error: errorMsg }, 500);
  }
};
