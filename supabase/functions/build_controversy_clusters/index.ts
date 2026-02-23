// Supabase Edge Function: build_controversy_clusters.
// Topic-based grouping: merges position pairs into multi-sided controversies.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL, DRIFT_THRESHOLD, TOPIC_SIMILARITY_THRESHOLD.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, min_controversy_score?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CONTROVERSY_SCORE = 1;
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;
const MAX_POSITIONS_PER_CONTROVERSY = 20;

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

function parseEmbedding(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.every((x) => typeof x === "number") ? (v as number[]) : null;
  if (typeof v === "string") {
    try {
      const arr = JSON.parse(v) as unknown;
      return Array.isArray(arr) && arr.every((x) => typeof x === "number") ? (arr as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function generateQuestionForN(
  apiKey: string,
  model: string,
  positions: Array<{ label: string; claimTexts: string[] }>
): Promise<string> {
  const system = `Given multiple positions and sample claims from each, generate a neutral debate question that they answer differently.
One sentence max. No preamble. Avoid bias. Do not respond with meta-questions like "What is the debate?"; provide a concrete question based on the claims.`;

  const blocks = positions
    .map(
      (p, i) =>
        `Position ${String.fromCharCode(65 + i)} (${p.label}):\n${p.claimTexts.slice(0, 3).map((t, j) => `${j + 1}. ${t}`).join("\n")}`
    )
    .join("\n\n");
  const user = `${blocks}\n\nNeutral question:`;

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

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const rawContent = data?.choices?.[0]?.message?.content;
  const finishReason = data?.choices?.[0]?.finish_reason;

  if (rawContent == null || rawContent === "") {
    console.log("[build_controversy_clusters] LLM returned empty", {
      finish_reason: finishReason,
      positions_count: positions.length,
      labels: positions.map((p) => p.label),
      claim_counts: positions.map((p) => p.claimTexts.length),
      prompt_preview: positions
        .map((p, i) => `P${i + 1}(${p.label},${p.claimTexts.length} claims)`)
        .join("; "),
    });
  }

  return (rawContent ?? "What is the debate?").trim().slice(0, 500);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : sum / denom;
}

function meanCentroidN(centroids: number[][]): number[] {
  if (centroids.length === 0) return [];
  const dim = centroids[0].length;
  if (centroids.some((c) => c.length !== dim)) return [];
  const out = new Array(dim).fill(0);
  for (const c of centroids) {
    for (let i = 0; i < dim; i++) out[i] += c[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= centroids.length;
  const mag = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return out;
  for (let i = 0; i < out.length; i++) out[i] /= mag;
  return out;
}

async function getEmbeddingsBatch(apiKey: string, texts: string[], model: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI embeddings ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const items = data?.data ?? [];
  return items.map((d) => d.embedding ?? []).filter((e) => e.length === DEFAULT_EMBEDDING_DIMS);
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
  const driftThreshold = parseFloat(Deno.env.get("DRIFT_THRESHOLD") ?? "0.75") || 0.75;
  const topicThreshold = parseFloat(Deno.env.get("TOPIC_SIMILARITY_THRESHOLD") ?? "0.75") || 0.75;

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
    .select("position_a_id, position_b_id, controversy_score")
    .gte("controversy_score", minScore);

  const pairs = (pairRows ?? []) as Array<{ position_a_id: string; position_b_id: string }>;

  if (dryRun) {
    return json({ ok: true, pairs_found: pairs.length, dry_run: true });
  }

  // Batch fetch: all active positions with centroids
  const { data: allPosRows } = await supabase
    .from("position_clusters")
    .select("position_cluster_id, label, centroid_embedding")
    .eq("status", "active")
    .not("centroid_embedding", "is", null);

  const centroidByPos = new Map<string, number[]>();
  const labelByPos = new Map<string, string>();
  for (const row of allPosRows ?? []) {
    const pid = (row as { position_cluster_id: string }).position_cluster_id;
    const emb = parseEmbedding((row as { centroid_embedding?: unknown }).centroid_embedding);
    if (emb && emb.length > 0) {
      centroidByPos.set(pid, emb);
      labelByPos.set(pid, (row as { label?: string }).label ?? "Position");
    }
  }

  const allPosIds = Array.from(centroidByPos.keys());

  // Batch fetch claim texts per position (top 5 claims each).
  // PostgREST .in() uses URL params; large arrays hit URI length limits. Chunk to avoid.
  const IN_CHUNK = 50;
  const claimTextsByPos = new Map<string, string[]>();
  if (allPosIds.length > 0) {
    const posToClaimIds = new Map<string, string[]>();
    for (let i = 0; i < allPosIds.length; i += IN_CHUNK) {
      const chunk = allPosIds.slice(i, i + IN_CHUNK);
      const { data: pccRows } = await supabase
        .from("position_cluster_claims")
        .select("position_cluster_id, claim_id")
        .in("position_cluster_id", chunk)
        .order("role", { ascending: true });

      for (const row of pccRows ?? []) {
        const pid = (row as { position_cluster_id: string }).position_cluster_id;
        const cid = (row as { claim_id: string }).claim_id;
        const arr = posToClaimIds.get(pid) ?? [];
        if (arr.length < 5) arr.push(cid);
        posToClaimIds.set(pid, arr);
      }
    }

    const claimIds = Array.from(new Set([...posToClaimIds.values()].flat()));
    if (claimIds.length > 0) {
      const textByClaim = new Map<string, string>();
      for (let i = 0; i < claimIds.length; i += IN_CHUNK) {
        const chunk = claimIds.slice(i, i + IN_CHUNK);
        const { data: claimRows } = await supabase
          .from("claims")
          .select("claim_id, canonical_text")
          .in("claim_id", chunk);
        for (const r of claimRows ?? []) {
          const cid = (r as { claim_id: string }).claim_id;
          const t = ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 200);
          if (t) textByClaim.set(cid, t);
        }
      }
      for (const [pid, cids] of posToClaimIds) {
        const texts = cids.map((cid) => textByClaim.get(cid)).filter(Boolean) as string[];
        if (texts.length > 0) claimTextsByPos.set(pid, texts);
      }
    }
  }

  // Topic-based grouping: for each pair, form group of similar positions
  type Group = { positionIds: string[]; fingerprint: string };
  const groupsByFp = new Map<string, Group>();

  for (const p of pairs) {
    const centroidA = centroidByPos.get(p.position_a_id);
    const centroidB = centroidByPos.get(p.position_b_id);
    if (!centroidA || !centroidB || centroidA.length !== centroidB.length) continue;

    const debateCentroid = meanCentroidN([centroidA, centroidB]);
    if (debateCentroid.length === 0) continue;

    const similar = new Set<string>([p.position_a_id, p.position_b_id]);
    for (const pid of allPosIds) {
      const cent = centroidByPos.get(pid);
      if (!cent || cent.length !== debateCentroid.length) continue;
      if (cosineSimilarity(cent, debateCentroid) >= topicThreshold) {
        similar.add(pid);
      }
    }

    const positionIds = Array.from(similar)
      .sort()
      .slice(0, MAX_POSITIONS_PER_CONTROVERSY);
    if (positionIds.length < 2) continue;

    const fpInput = positionIds.join("|");
    const fingerprint = await sha256Hex(fpInput);
    if (!groupsByFp.has(fingerprint)) {
      groupsByFp.set(fingerprint, { positionIds, fingerprint });
    }
  }

  const groups = Array.from(groupsByFp.values());
  console.log("[build_controversy_clusters] groups", {
    pairs_count: pairs.length,
    groups_count: groups.length,
  });

  // Generate question per group, batch embed, drift check
  type PendingGroup = {
    fingerprint: string;
    positionIds: string[];
    question: string;
    centroids: number[][];
  };

  const pending: PendingGroup[] = [];

  for (const g of groups) {
    const positionsForLLM = g.positionIds.map((pid) => ({
      label: labelByPos.get(pid) ?? "Position",
      claimTexts: claimTextsByPos.get(pid) ?? [],
    }));

    const hasClaims = positionsForLLM.some((p) => p.claimTexts.length > 0);
    let question = "What is the debate?";
    if (!hasClaims) {
      console.log("[build_controversy_clusters] Skipping LLM: no claims for group", {
        position_ids: g.positionIds.slice(0, 3),
        labels: positionsForLLM.map((p) => p.label),
      });
    } else if (OPENAI_API_KEY) {
      try {
        question = await generateQuestionForN(OPENAI_API_KEY, MODEL, positionsForLLM);
      } catch (e) {
        console.error("[build_controversy_clusters] LLM question:", e);
      }
    }

    if (question === "What is the debate?") continue;

    const centroids = g.positionIds.map((pid) => centroidByPos.get(pid)).filter((c): c is number[] => !!c);
    if (centroids.length < 2) continue;

    pending.push({
      fingerprint: g.fingerprint,
      positionIds: g.positionIds,
      question,
      centroids,
    });
  }

  console.log("[build_controversy_clusters] after LLM", {
    pending_count: pending.length,
    skipped_fallback: groups.length - pending.length,
  });

  // Batch embed questions
  const questionsToEmbed = pending.filter((x) => x.question && x.question !== "What is the debate?").map((x) => x.question);
  let questionEmbeddings: number[][] = [];
  if (OPENAI_API_KEY && questionsToEmbed.length > 0) {
    try {
      questionEmbeddings = await getEmbeddingsBatch(OPENAI_API_KEY, questionsToEmbed, EMBEDDING_MODEL);
    } catch (e) {
      console.error("[build_controversy_clusters] Batch embed:", e);
    }
  }

  const pControversies: Array<{
    fingerprint: string;
    question: string;
    question_embedding?: string;
    positions: Array<{ position_cluster_id: string; stance_label: string }>;
  }> = [];

  let embedIdx = 0;
  for (const item of pending) {
    const { question: q, positionIds, centroids } = item;
    let questionEmbedding: string | undefined;

    if (q && q !== "What is the debate?" && embedIdx < questionEmbeddings.length) {
      const qEmb = questionEmbeddings[embedIdx];
      embedIdx++;

      const controversyCentroid = meanCentroidN(centroids);
      if (controversyCentroid.length > 0 && qEmb && qEmb.length === controversyCentroid.length) {
        const sim = cosineSimilarity(qEmb, controversyCentroid);
        if (sim < driftThreshold) continue;
      }
      if (qEmb) questionEmbedding = embeddingToString(qEmb);
    }

    const positions = positionIds.map((pid) => ({
      position_cluster_id: pid,
      stance_label: labelByPos.get(pid) ?? "Position",
    }));

    pControversies.push({
      fingerprint: item.fingerprint,
      question: item.question,
      question_embedding: questionEmbedding,
      positions,
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
