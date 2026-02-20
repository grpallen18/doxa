// Supabase Edge Function: build_controversy_clusters.
// Reads position_pair_scores, creates controversy clusters (pairs) where score >= threshold.
// Embeds the debate question for topic similarity search (match_controversies_nearest).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, min_controversy_score?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CONTROVERSY_SCORE = 1; // at least 1 contradictory or competing edge
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) {
    throw new Error("Invalid embedding response");
  }
  return emb;
}

function embeddingToString(emb: number[]): string {
  return `[${emb.join(",")}]`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_EMBEDDING_MODEL;

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

  const pControversies: Array<{
    fingerprint: string;
    position_a_id: string;
    position_b_id: string;
    question: string;
    label_a: string;
    label_b: string;
    question_embedding?: string;
  }> = [];

  for (const p of pairs) {
    const { data: posA } = await supabase
      .from("position_clusters")
      .select("position_cluster_id, label")
      .eq("position_cluster_id", p.position_a_id)
      .eq("status", "active")
      .single();
    const { data: posB } = await supabase
      .from("position_clusters")
      .select("position_cluster_id, label")
      .eq("position_cluster_id", p.position_b_id)
      .eq("status", "active")
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

    const fpInput = [p.position_a_id, p.position_b_id].sort().join("|");
    const fingerprint = await sha256Hex(fpInput);

    let questionEmbedding: string | undefined;
    if (OPENAI_API_KEY && question && question !== "What is the debate?") {
      try {
        const emb = await getEmbedding(OPENAI_API_KEY, question, EMBEDDING_MODEL);
        questionEmbedding = embeddingToString(emb);
      } catch (e) {
        console.error("[build_controversy_clusters] Embed question:", e);
      }
    }

    pControversies.push({
      fingerprint,
      position_a_id: p.position_a_id,
      position_b_id: p.position_b_id,
      question,
      label_a: labelA,
      label_b: labelB,
      question_embedding: questionEmbedding,
    });
  }

  const { data: rpcResult, error: rpcErr } = await supabase.rpc("upsert_controversy_clusters_batch", {
    p_controversies: pControversies,
  });

  if (rpcErr) {
    console.error("[build_controversy_clusters] RPC:", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  const res = rpcResult as { kept_count?: number; marked_inactive_count?: number } | null;
  return json({
    ok: true,
    controversies_created: pControversies.length,
    kept_count: res?.kept_count ?? pControversies.length,
    marked_inactive_count: res?.marked_inactive_count ?? 0,
  });
});
