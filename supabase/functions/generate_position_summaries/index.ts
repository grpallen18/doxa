// Supabase Edge Function: generate_position_summaries.
// Two modes in parallel: (1) LLM for cache misses up to 10, (2) sync from cache up to 500. No LLM for sync.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const LLM_BATCH_SIZE = 10;
const SYNC_BATCH_SIZE = 500;
const MAX_POSITIONS_TO_SCAN = 600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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
      max_tokens: Math.min(4000, 200 * positionsTexts.length + 500),
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
  async function runLLM(): Promise<number> {
    if (cacheMisses.length === 0) return 0;

    // Fetch claim texts for cache misses only
    const toProcess: Array<{ pid: string; fingerprint: string; texts: string[] }> = [];
    for (const { pid, fingerprint } of cacheMisses) {
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
      if (texts.length > 0) {
        toProcess.push({ pid, fingerprint, texts });
      }
    }

    if (toProcess.length === 0) return 0;

    try {
      const textsBatch = toProcess.map((b) => b.texts);
      const results = await generateSummaryBatch(OPENAI_API_KEY, MODEL, textsBatch);
      for (let j = 0; j < toProcess.length; j++) {
        const { pid, fingerprint } = toProcess[j];
        const { label, summary } = results[j] ?? { label: "Position", summary: "No summary." };
        await supabase.from("position_clusters").update({ label, summary }).eq("position_cluster_id", pid);
        await supabase.from("position_summary_cache").upsert(
          { membership_fingerprint: fingerprint, label, summary },
          { onConflict: "membership_fingerprint" }
        );
      }
      return toProcess.length;
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
});
