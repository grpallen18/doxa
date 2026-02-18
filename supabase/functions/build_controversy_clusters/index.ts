// Supabase Edge Function: build_controversy_clusters.
// Reads position_pair_scores, creates controversy clusters (pairs) where score >= threshold.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, min_controversy_score?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CONTROVERSY_SCORE = 1; // at least 1 contradictory or competing edge
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function generateQuestion(
  apiKey: string,
  model: string,
  positionALabel: string,
  positionBLabel: string,
  claimTextsA: string[],
  claimTextsB: string[]
): Promise<string> {
  const system = `Given two opposing positions and sample claims from each, generate a neutral debate question that they answer differently.
One sentence max. No preamble. Avoid bias.`;

  const user = `Position A (${positionALabel}):\n${claimTextsA.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join("\n")}

Position B (${positionBLabel}):\n${claimTextsB.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join("\n")}

Neutral question:`;

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
      max_tokens: 80,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "What is the debate?").trim().slice(0, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
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
  const minScore = Number(body.min_controversy_score) || MIN_CONTROVERSY_SCORE;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: pairRows } = await supabase
    .from("position_pair_scores")
    .select("position_a_id, position_b_id, controversy_score, contradictory_count, competing_framing_count")
    .gte("controversy_score", minScore);

  const pairs = (pairRows ?? []) as Array<{
    position_a_id: string;
    position_b_id: string;
    controversy_score: number;
    contradictory_count: number;
    competing_framing_count: number;
  }>;

  if (dryRun) {
    return json({ ok: true, controversies_found: pairs.length, dry_run: true });
  }

  // Clear existing
  const { data: existing } = await supabase.from("controversy_clusters").select("controversy_cluster_id");
  const existingIds = (existing ?? []).map((r) => (r as { controversy_cluster_id: string }).controversy_cluster_id);
  if (existingIds.length > 0) {
    await supabase.from("controversy_clusters").delete().in("controversy_cluster_id", existingIds);
  }

  let created = 0;
  for (const p of pairs) {
    const { data: posA } = await supabase
      .from("position_clusters")
      .select("position_cluster_id, label")
      .eq("position_cluster_id", p.position_a_id)
      .single();
    const { data: posB } = await supabase
      .from("position_clusters")
      .select("position_cluster_id, label")
      .eq("position_cluster_id", p.position_b_id)
      .single();
    if (!posA || !posB) continue;

    const { data: claimsA } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", p.position_a_id)
      .limit(5);
    const { data: claimsB } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", p.position_b_id)
      .limit(5);

    const claimIdsA = (claimsA ?? []).map((r) => (r as { claim_id: string }).claim_id);
    const claimIdsB = (claimsB ?? []).map((r) => (r as { claim_id: string }).claim_id);

    let textsA: string[] = [];
    let textsB: string[] = [];
    if (claimIdsA.length > 0) {
      const { data: claimRowsA } = await supabase.from("claims").select("canonical_text").in("claim_id", claimIdsA);
      textsA = (claimRowsA ?? []).map((r) => ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 200)).filter(Boolean);
    }
    if (claimIdsB.length > 0) {
      const { data: claimRowsB } = await supabase.from("claims").select("canonical_text").in("claim_id", claimIdsB);
      textsB = (claimRowsB ?? []).map((r) => ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 200)).filter(Boolean);
    }

    const labelA = (posA as { label?: string }).label ?? "Position A";
    const labelB = (posB as { label?: string }).label ?? "Position B";

    let question = "What is the debate?";
    if (OPENAI_API_KEY && textsA.length > 0 && textsB.length > 0) {
      try {
        question = await generateQuestion(OPENAI_API_KEY, MODEL, labelA, labelB, textsA, textsB);
      } catch (e) {
        console.error("[build_controversy_clusters] LLM question:", e);
      }
    }

    const { data: ins, error: insErr } = await supabase
      .from("controversy_clusters")
      .insert({ question, label: question })
      .select("controversy_cluster_id")
      .single();

    if (insErr) {
      console.error("[build_controversy_clusters] insert:", insErr.message);
      continue;
    }

    const cid = (ins as { controversy_cluster_id: string }).controversy_cluster_id;
    await supabase.from("controversy_cluster_positions").insert([
      { controversy_cluster_id: cid, position_cluster_id: p.position_a_id, side: "A", stance_label: labelA },
      { controversy_cluster_id: cid, position_cluster_id: p.position_b_id, side: "B", stance_label: labelB },
    ]);
    created++;
  }

  return json({ ok: true, controversies_created: created });
});
