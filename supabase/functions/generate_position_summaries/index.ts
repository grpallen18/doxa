// Supabase Edge Function: generate_position_summaries.
// Two modes in parallel: (1) LLM for cache misses up to 10, (2) sync from cache up to 500. No LLM for sync.
// Drift check: only persist label/summary when similarity(label+summary embedding, centroid) >= threshold.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL, DRIFT_THRESHOLD.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const LLM_BATCH_SIZE = 10;
const SYNC_BATCH_SIZE = 500;
const MAX_POSITIONS_TO_SCAN = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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
  return items.map((d) => d.embedding ?? []).filter((e) => e.length > 0);
}

async function generateSummaryBatch(
  apiKey: string,
  model: string,
  positionsTexts: string[][]
): Promise<Array<{ label: string; summary: string }>> {
  const blocks = positionsTexts
    .map((texts, i) => `Position ${i + 1} claims:\n${texts.slice(0, 8).map((t, j) => `${j + 1}. ${t}`).join("\n")}`)
    .join("\n\n");

  const system = `Given multiple position sets below, produce a JSON array with one object per position: [{"label":"...","summary":"..."}, ...]
For each position: label = short 2-5 word stance name; summary = 2-5 sentences, neutral and factual.`;

  const user = `${blocks}\n\nOutput only the JSON array. No preamble.`;

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
      max_tokens: Math.min(10000, 250 * positionsTexts.length + 1000),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data?.choices?.[0]?.message?.content ?? "").trim();
  try {
    const parsed = JSON.parse(content) as Array<{ label?: string; summary?: string }>;
    if (!Array.isArray(parsed)) {
      return positionsTexts.map(() => ({ label: "Position", summary: "No summary." }));
    }
    return parsed.map((p, i) => ({
      label: ((parsed[i]?.label ?? p?.label ?? "Position") as string).slice(0, 100),
      summary: ((parsed[i]?.summary ?? p?.summary ?? "No summary.") as string).slice(0, 1000),
    }));
  } catch {
    return positionsTexts.map(() => ({ label: "Position", summary: content.slice(0, 1000) || "No summary." }));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;
  const driftThreshold = parseFloat(Deno.env.get("DRIFT_THRESHOLD") ?? "0.75") || 0.75;

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

  try {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Phase 1: Categorization - fetch positions, use membership_fingerprint directly, find cache misses
  const { data: positionRows } = await supabase
    .from("position_clusters")
    .select("position_cluster_id, membership_fingerprint")
    .eq("status", "active")
    .limit(MAX_POSITIONS_TO_SCAN);

  const positions = (positionRows ?? []) as Array<{ position_cluster_id: string; membership_fingerprint: string | null }>;
  if (positions.length === 0) {
    return json({ ok: true, llm_created: 0, sync_updated: 0, cache_misses: 0, cache_synced: 0, message: "No active position clusters" });
  }

  const cacheMisses: Array<{ pid: string; fingerprint: string }> = [];
  for (const { position_cluster_id: pid, membership_fingerprint: fp } of positions) {
    if (cacheMisses.length >= LLM_BATCH_SIZE) break;
    if (!fp) continue;

    const { data: cached } = await supabase
      .from("position_summary_cache")
      .select("label, summary")
      .eq("membership_fingerprint", fp)
      .maybeSingle();

    if (cached && (cached as { label?: string }).label) {
      continue; // cache hit - sync RPC handles
    }
    cacheMisses.push({ pid, fingerprint: fp });
  }

  if (dryRun) {
    return json({ ok: true, would_llm: cacheMisses.length, dry_run: true });
  }

  // Phase 2: Parallel - LLM path and sync path
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_EMBEDDING_MODEL;

  async function runLLM(): Promise<number> {
    if (cacheMisses.length === 0) return 0;

    // Batch fetch claim texts for cache misses (2 queries instead of N*2)
    const pids = cacheMisses.map((c) => c.pid);
    const { data: pccRows } = await supabase
      .from("position_cluster_claims")
      .select("position_cluster_id, claim_id")
      .in("position_cluster_id", pids)
      .order("role", { ascending: true });

    const pidToClaimIds = new Map<string, string[]>();
    for (const row of pccRows ?? []) {
      const pid = (row as { position_cluster_id: string }).position_cluster_id;
      const cid = (row as { claim_id: string }).claim_id;
      const arr = pidToClaimIds.get(pid) ?? [];
      if (arr.length < 10) arr.push(cid);
      pidToClaimIds.set(pid, arr);
    }

    const allClaimIds = Array.from(new Set([...pidToClaimIds.values()].flat()));
    const claimIdToText = new Map<string, string>();
    if (allClaimIds.length > 0) {
      const { data: claimRows } = await supabase.from("claims").select("claim_id, canonical_text").in("claim_id", allClaimIds);
      for (const r of claimRows ?? []) {
        const cid = (r as { claim_id: string }).claim_id;
        const t = ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 300);
        if (t) claimIdToText.set(cid, t);
      }
    }

    const toProcess: Array<{ pid: string; fingerprint: string; texts: string[] }> = [];
    for (const { pid, fingerprint } of cacheMisses) {
      const cids = pidToClaimIds.get(pid) ?? [];
      const texts = cids.map((cid) => claimIdToText.get(cid)).filter(Boolean) as string[];
      if (texts.length > 0) {
        toProcess.push({ pid, fingerprint, texts });
      }
    }

    if (toProcess.length === 0) return 0;

    try {
      const textsBatch = toProcess.map((b) => b.texts);
      const results = await generateSummaryBatch(OPENAI_API_KEY, MODEL, textsBatch);

      // Batch fetch centroids for drift check
      const pids = toProcess.map((t) => t.pid);
      const { data: centroidRows } = await supabase
        .from("position_clusters")
        .select("position_cluster_id, centroid_embedding")
        .in("position_cluster_id", pids);

      const centroidByPid = new Map<string, number[]>();
      for (const row of centroidRows ?? []) {
        const emb = parseEmbedding((row as { centroid_embedding?: unknown }).centroid_embedding);
        if (emb && emb.length > 0) {
          centroidByPid.set((row as { position_cluster_id: string }).position_cluster_id, emb);
        }
      }

      // Batch embed label+summary for drift check
      const labelSummaryTexts = results.map((r) => {
        const { label, summary } = r ?? { label: "Position", summary: "No summary." };
        return `${label} ${summary}`.trim().slice(0, 500);
      });
      const labelEmbeddings = await getEmbeddingsBatch(OPENAI_API_KEY, labelSummaryTexts, EMBEDDING_MODEL);

      const updates: Promise<unknown>[] = [];
      for (let j = 0; j < toProcess.length; j++) {
        const { pid, fingerprint } = toProcess[j];
        const { label, summary } = results[j] ?? { label: "Position", summary: "No summary." };
        const centroid = centroidByPid.get(pid);
        const labelEmb = labelEmbeddings[j];

        // Drift check: only persist if similarity >= threshold
        if (!centroid || !labelEmb || labelEmb.length !== centroid.length) {
          continue;
        }
        const sim = cosineSimilarity(labelEmb, centroid);
        if (sim < driftThreshold) {
          continue;
        }

        updates.push(
          supabase.from("position_clusters").update({ label, summary, label_ok: true }).eq("position_cluster_id", pid),
          supabase.from("position_summary_cache").upsert(
            { membership_fingerprint: fingerprint, label, summary },
            { onConflict: "membership_fingerprint" }
          )
        );
      }
      await Promise.all(updates);
      return updates.length / 2;
    } catch (e) {
      console.error("[generate_position_summaries] LLM batch:", e);
      return 0;
    }
  }

  async function runSync(): Promise<number> {
    const { data, error } = await supabase.rpc("sync_position_summaries_from_cache", { p_max_count: SYNC_BATCH_SIZE });
    if (error) {
      console.error("[generate_position_summaries] sync RPC:", error.message);
      return 0;
    }
    return (data as { synced_count?: number })?.synced_count ?? 0;
  }

  const [llmCreated, syncUpdated] = await Promise.all([runLLM(), runSync()]);

  return json({
    ok: true,
    llm_created: llmCreated,
    sync_updated: syncUpdated,
    cache_misses: llmCreated,
    cache_synced: syncUpdated,
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate_position_summaries]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
