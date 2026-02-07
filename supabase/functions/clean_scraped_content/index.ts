// Supabase Edge Function: clean raw article text with LLM (remove site chrome).
// Selects story_bodies where content_clean IS NULL, sends content_raw to OpenAI, writes content_clean.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_MODEL. Optional: OPENAI_MODEL_LARGE.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_stories?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const LARGE_CONTENT_THRESHOLD = 12_000;
const VERY_LONG_CONTENT_THRESHOLD = 30_000;
const HEAD_TAIL_CHARS = 5_000;

const CLEANER_SYSTEM_PROMPT = `You clean scraped article text for DOXA. The input often includes site chrome: navigation, footer, ads, "Sign up for our newsletter", related article links, social sharing buttons, cookie consent text, etc.

Remove all non-article content. Return only the main article body text.
Preserve paragraphs and readability. Return plain text only. No HTML, no JSON wrapper.`;

const CLEANER_LONG_SYSTEM_PROMPT = `You clean the START and END of scraped article text for DOXA. These segments often include site chrome: navigation, footer, ads, "Sign up for our newsletter", related article links, etc.

You receive two text blocks: "start" (first 5000 chars) and "end" (last 5000 chars). Clean each block to remove non-article content. Return only the cleaned main article text for each block.

Return JSON only: { "start": "cleaned start text", "end": "cleaned end text" }
Preserve paragraphs and readability.`;

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

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

async function callCleanerFull(
  apiKey: string,
  model: string,
  content: string,
  requestId: string
): Promise<string> {
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
        { role: "system", content: CLEANER_SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[clean_scraped_content] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");
  return contentStr.trim();
}

async function callCleanerHeadTail(
  apiKey: string,
  model: string,
  start: string,
  end: string,
  requestId: string
): Promise<{ start: string; end: string }> {
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
        { role: "system", content: CLEANER_LONG_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ start, end }) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doxa_cleaner_head_tail",
          strict: true,
          schema: {
            type: "object",
            properties: {
              start: { type: "string" },
              end: { type: "string" },
            },
            required: ["start", "end"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[clean_scraped_content] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as { start?: string; end?: string };
  const startClean = typeof parsed.start === "string" ? parsed.start.trim() : "";
  const endClean = typeof parsed.end === "string" ? parsed.end.trim() : "";
  return { start: startClean, end: endClean };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
  const OPENAI_MODEL_LARGE = Deno.env.get("OPENAI_MODEL_LARGE") ?? "gpt-5.2-2025-12-11";

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
  const maxStories = clampInt(body.max_stories, 1, 1, 1);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const requestId = `clean-scraped-${Date.now()}`;

  const { data: rows, error: fetchErr } = await supabase
    .from("story_bodies")
    .select("story_id, content_raw, content_length_raw")
    .is("content_clean", null)
    .not("content_raw", "is", null)
    .order("scraped_at", { ascending: true })
    .limit(maxStories);

  if (fetchErr) {
    console.error("[clean_scraped_content] story_bodies fetch error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const candidates = (Array.isArray(rows) ? rows : []).filter(
    (r): r is { story_id: string; content_raw: string; content_length_raw: number | null } =>
      typeof r === "object" && r !== null && typeof (r as { story_id: unknown }).story_id === "string"
  );

  if (candidates.length === 0) {
    return json({ ok: true, processed: 0, message: "No story_bodies to clean" });
  }

  const row = candidates[0];
  const contentRaw = (row.content_raw ?? "").trim();
  const contentLengthRaw = row.content_length_raw ?? contentRaw.length;

  if (contentRaw.length === 0) {
    return json({ ok: true, processed: 0, message: "Empty content_raw" });
  }

  const model = contentLengthRaw > LARGE_CONTENT_THRESHOLD ? OPENAI_MODEL_LARGE : OPENAI_MODEL;

  let contentClean: string;

  if (contentLengthRaw > VERY_LONG_CONTENT_THRESHOLD) {
    const start = contentRaw.slice(0, HEAD_TAIL_CHARS);
    const end = contentRaw.slice(-HEAD_TAIL_CHARS);
    const middle = contentRaw.slice(HEAD_TAIL_CHARS, contentRaw.length - HEAD_TAIL_CHARS);
    const { start: startClean, end: endClean } = await callCleanerHeadTail(
      OPENAI_API_KEY,
      model,
      start,
      end,
      requestId
    );
    contentClean = startClean + middle + endClean;
  } else {
    contentClean = await callCleanerFull(OPENAI_API_KEY, model, contentRaw, requestId);
  }

  if (!dryRun) {
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("story_bodies")
      .update({
        content_clean: contentClean,
        cleaned_at: now,
        cleaner_model: model,
      })
      .eq("story_id", row.story_id);

    if (updateErr) {
      console.error("[clean_scraped_content] story_bodies update error:", updateErr.message);
      return json({ error: updateErr.message }, 500);
    }
  }

  return json({
    ok: true,
    processed: 1,
    story_id: row.story_id,
    content_length_raw: contentLengthRaw,
    content_length_clean: contentClean.length,
    model,
    dry_run: dryRun,
  });
});
