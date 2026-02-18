// Supabase Edge Function: generate_viewpoints.
// LLM generates viewpoint summary per (controversy, position).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, max_viewpoints?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_VIEWPOINTS = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function generateViewpoint(
  apiKey: string,
  model: string,
  question: string,
  stanceLabel: string,
  claimTexts: string[]
): Promise<string> {
  const system = `Given a debate question and one side's claims, write a 2-4 sentence viewpoint summary that reads as "This side argues that...". Be factual and neutral.`;

  const user = `Debate question: ${question}

This side (${stanceLabel}):\n${claimTexts.slice(0, 6).map((t, i) => `${i + 1}. ${t}`).join("\n")}

Viewpoint summary:`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 250,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "No viewpoint.").trim().slice(0, 2000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const rawBody = await req.json().catch(() => ({}));
    if (rawBody !== null && typeof rawBody === "object" && !Array.isArray(rawBody)) {
      body = rawBody as Record<string, unknown>;
    }
  } catch {
    /* use defaults */
  }
  const dryRun = Boolean(body.dry_run ?? false);
  const maxViewpoints = Math.min(200, Math.max(1, Number(body.max_viewpoints) || DEFAULT_MAX_VIEWPOINTS));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: links } = await supabase
    .from("controversy_cluster_positions")
    .select("controversy_cluster_id, position_cluster_id, stance_label")
    .limit(maxViewpoints);

  const items = (links ?? []) as Array<{
    controversy_cluster_id: string;
    position_cluster_id: string;
    stance_label: string | null;
  }>;

  if (items.length === 0) {
    return json({ ok: true, created: 0, message: "No controversy-position links" });
  }

  if (dryRun) {
    return json({ ok: true, would_create: items.length, dry_run: true });
  }

  let created = 0;
  for (const item of items) {
    const { data: controversy } = await supabase
      .from("controversy_clusters")
      .select("question")
      .eq("controversy_cluster_id", item.controversy_cluster_id)
      .single();
    const question = (controversy as { question?: string } | null)?.question ?? "What is the debate?";

    const { data: members } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", item.position_cluster_id)
      .limit(8);
    const claimIds = (members ?? []).map((r) => (r as { claim_id: string }).claim_id);

    let texts: string[] = [];
    if (claimIds.length > 0) {
      const { data: claimRows } = await supabase.from("claims").select("canonical_text").in("claim_id", claimIds);
      texts = (claimRows ?? []).map((r) => ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 250)).filter(Boolean);
    }

    const stanceLabel = item.stance_label ?? "This position";

    try {
      const summary = await generateViewpoint(OPENAI_API_KEY, MODEL, question, stanceLabel, texts);

      await supabase.from("controversy_viewpoints").upsert(
        {
          controversy_cluster_id: item.controversy_cluster_id,
          position_cluster_id: item.position_cluster_id,
          title: stanceLabel,
          summary,
          version: 1,
          model: MODEL,
        },
        { onConflict: "controversy_cluster_id,position_cluster_id" }
      );
      created++;
    } catch (e) {
      console.error("[generate_viewpoints] LLM:", e);
    }
  }

  return json({ ok: true, created });
});
