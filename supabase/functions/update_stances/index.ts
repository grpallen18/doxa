// Supabase Edge Function: backfill stance on story_claims that have null stance.
// For each claim, sends raw_text + article content to LLM; LLM returns support/oppose/neutral.
// Processes one claim at a time by default so the LLM can focus on accurate output.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_claims?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_CLAIMS = 1;
const CONTENT_MAX_CHARS = 6000;

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

const STANCE_SYSTEM_PROMPT = `You assign stance to a claim extracted from a news article for DOXA.

You are given:
1) A CLAIM - a factual or normative assertion that was extracted from the article.
2) ARTICLE CONTENT - the full (or truncated) article text.

Your task: Decide how the article frames the claim as a proposition. Output one of: support | oppose | neutral.

DEFINITIONS:
- support: The article argues the claim is true/valid. It presents evidence, quotes, or analysis that backs the claim. The outlet's framing favors the claim.
- oppose: The article argues against or undermines the claim. It presents counterevidence, skepticism, or alternative framing that undercuts the claim.
- neutral: Unclear, mixed, or the article just reports without taking a position. The article presents multiple views without favoring one, or the stance cannot be determined from the content.

IMPORTANT: Stance is about the article's position on the claim as a proposition, NOT the linguistic form. A claim phrased as a denial ("Officials denied wrongdoing") can still have stance support if the article treats the denial as credible, or stance oppose if the article undercuts it with contrary evidence.

Return JSON only: { "stance": "support" | "oppose" | "neutral" }`;

async function callStanceLLM(
  apiKey: string,
  model: string,
  rawText: string,
  articleContent: string,
  requestId: string
): Promise<"support" | "oppose" | "neutral"> {
  const userPayload = {
    claim: rawText,
    article_content: truncate(articleContent, CONTENT_MAX_CHARS),
  };

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
        { role: "system", content: STANCE_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "doxa_stance",
          strict: true,
          schema: {
            type: "object",
            properties: {
              stance: { type: "string", enum: ["support", "oppose", "neutral"] },
            },
            required: ["stance"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[update_stances] OpenAI ${resp.status}:`, text.slice(0, 500));
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const contentStr = data?.choices?.[0]?.message?.content;
  if (typeof contentStr !== "string") throw new Error("Missing OpenAI content");

  const parsed = JSON.parse(contentStr) as { stance?: string };
  const stance = parsed?.stance;
  if (stance === "support" || stance === "oppose" || stance === "neutral") {
    return stance;
  }
  return "neutral";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

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
  const maxClaims = clampInt(body.max_claims, 1, 10, DEFAULT_MAX_CLAIMS);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: rowsRaw, error: rpcErr } = await supabase.rpc("get_story_claims_needing_stance", {
    p_limit: maxClaims,
  });

  if (rpcErr) {
    console.error("[update_stances] get_story_claims_needing_stance error:", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as Array<{
    story_claim_id: string;
    story_id: string;
    raw_text: string | null;
    content_clean: string | null;
  }>;

  const toProcess = rows.filter(
    (r) =>
      typeof r.story_claim_id === "string" &&
      typeof r.story_id === "string" &&
      typeof r.raw_text === "string" &&
      r.raw_text.trim().length > 0 &&
      typeof r.content_clean === "string" &&
      r.content_clean.trim().length > 0
  );

  if (toProcess.length === 0) {
    return json({
      ok: true,
      processed: 0,
      message: "No story_claims needing stance",
      dry_run: dryRun,
    });
  }

  const requestId = `update-stances-${Date.now()}`;
  let processed = 0;

  for (const row of toProcess) {
    const rawText = (row.raw_text ?? "").trim();
    const articleContent = (row.content_clean ?? "").trim();

    let stance: "support" | "oppose" | "neutral";
    try {
      stance = await callStanceLLM(
        OPENAI_API_KEY,
        MODEL,
        rawText,
        articleContent,
        `${requestId}-${row.story_claim_id}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[update_stances] LLM error for", row.story_claim_id, msg);
      return json({
        error: msg,
        story_claim_id: row.story_claim_id,
        story_id: row.story_id,
      }, 500);
    }

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from("story_claims")
        .update({ stance })
        .eq("story_claim_id", row.story_claim_id);

      if (updateErr) {
        console.error("[update_stances] Update error:", updateErr.message);
        return json({ error: updateErr.message, story_claim_id: row.story_claim_id }, 500);
      }
    }

    processed += 1;
  }

  return json({
    ok: true,
    processed,
    model: MODEL,
    dry_run: dryRun,
  });
});
