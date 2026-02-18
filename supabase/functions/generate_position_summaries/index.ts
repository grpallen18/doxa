// Supabase Edge Function: generate_position_summaries.
// LLM generates label + summary for each position_cluster.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, max_positions?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_POSITIONS = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function generateSummary(
  apiKey: string,
  model: string,
  claimTexts: string[]
): Promise<{ label: string; summary: string }> {
  const system = `Given a set of claims that support the same position, produce:
1. label: A short 2-5 word stance name (e.g. "Pro-regulation", "Skeptical of government")
2. summary: 2-5 sentences describing the stance. Be neutral and factual.
Output as JSON: {"label":"...","summary":"..."}`;

  const user = `Claims:\n${claimTexts.slice(0, 8).map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

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
      max_tokens: 200,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data?.choices?.[0]?.message?.content ?? "").trim();
  try {
    const parsed = JSON.parse(content) as { label?: string; summary?: string };
    return {
      label: (parsed.label ?? "Position").slice(0, 100),
      summary: (parsed.summary ?? "No summary.").slice(0, 1000),
    };
  } catch {
    return { label: "Position", summary: content.slice(0, 1000) || "No summary." };
  }
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
  const maxPositions = Math.min(100, Math.max(1, Number(body.max_positions) || DEFAULT_MAX_POSITIONS));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: positions } = await supabase
    .from("position_clusters")
    .select("position_cluster_id")
    .limit(maxPositions);

  const positionIds = (positions ?? []).map((r) => (r as { position_cluster_id: string }).position_cluster_id);
  if (positionIds.length === 0) {
    return json({ ok: true, updated: 0, message: "No position clusters" });
  }

  if (dryRun) {
    return json({ ok: true, would_update: positionIds.length, dry_run: true });
  }

  let updated = 0;
  for (const pid of positionIds) {
    const { data: members } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", pid)
      .order("role", { ascending: true })
      .limit(10);
    const claimIds = (members ?? []).map((r) => (r as { claim_id: string }).claim_id);
    if (claimIds.length === 0) continue;

    const { data: claimRows } = await supabase.from("claims").select("canonical_text").in("claim_id", claimIds);
    const texts = (claimRows ?? [])
      .map((r) => ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 300))
      .filter(Boolean);

    if (texts.length === 0) continue;

    try {
      const { label, summary } = await generateSummary(OPENAI_API_KEY, MODEL, texts);
      await supabase
        .from("position_clusters")
        .update({ label, summary })
        .eq("position_cluster_id", pid);
      updated++;
    } catch (e) {
      console.error("[generate_position_summaries] LLM:", e);
    }
  }

  return json({ ok: true, updated });
});
