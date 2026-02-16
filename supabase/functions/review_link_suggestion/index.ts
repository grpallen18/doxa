// Supabase Edge Function: review_link_suggestion.
// Validates a user-suggested link from a span of text to a topic. LLM decides if appropriate and returns the exact phrase to link.
// Env: OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { span_text, context_before, context_after, target_topic: { title, topic_description } }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const CHAT_MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

  if (!OPENAI_API_KEY) {
    return json({ error: "Missing OPENAI_API_KEY" }, 500);
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

  const spanText = typeof body.span_text === "string" ? body.span_text.trim() : "";
  const contextBefore = typeof body.context_before === "string" ? body.context_before : "";
  const contextAfter = typeof body.context_after === "string" ? body.context_after : "";
  const targetTopic = body.target_topic as { title?: string; topic_description?: string } | undefined;
  const targetTitle = typeof targetTopic?.title === "string" ? targetTopic.title : "";
  const targetDescription = typeof targetTopic?.topic_description === "string" ? targetTopic.topic_description : "";

  if (!spanText || !targetTitle) {
    return json({ error: "span_text and target_topic.title are required" }, 400);
  }

  try {
    const system = `You validate user-suggested links in a knowledge-base article. A user has highlighted a span of text and suggested linking it to another topic. Your job is to decide if the link is appropriate.

If appropriate: return approved=true and phrase= the exact substring from the span that should become the link text (you may trim articles like "the" or minor words if they don't belong to the topic name).
If not appropriate: return approved=false and reason= a brief explanation (e.g. "The span does not refer to the suggested topic", "The link would be misleading").

Output only valid JSON: { "approved": boolean, "phrase"?: string, "reason"?: string }. No other text.`;

    const contextDisplay = `...${contextBefore}[SPAN]${contextAfter}...`;
    const userContent = `Span the user selected: "${spanText}"
Context in the article: ${contextDisplay}

Suggested topic to link to:
Title: ${targetTitle}
Description: ${targetDescription}

Is this link appropriate? Output JSON only.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        max_tokens: 150,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return json({ error: `OpenAI ${resp.status}: ${err.slice(0, 200)}` }, 502);
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data?.error) {
      return json({ error: data.error.message ?? "OpenAI error" }, 502);
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return json({ error: "Missing OpenAI content" }, 502);
    }

    const parsed = JSON.parse(content) as { approved?: boolean; phrase?: string; reason?: string };
    const approved = Boolean(parsed.approved);
    const phrase = typeof parsed.phrase === "string" ? parsed.phrase.trim() : undefined;
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : undefined;

    return json({
      approved,
      phrase: approved ? (phrase || spanText) : undefined,
      reason: !approved ? (reason || "Link was not approved") : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[review_link_suggestion] Error:", msg);
    return json({ error: msg }, 500);
  }
});
