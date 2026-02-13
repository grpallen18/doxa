// Supabase Edge Function: label_thesis.
// Finds theses with biggest centroid-vs-text discrepancy, writes/rewrites thesis_text via LLM, updates drift flags.
// Covers both new labels and relabels.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, batch_theses?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_DIMS = 1536;
const MIN_CLAIMS_FOR_TEXT = 5;
const MIN_NEW_CLAIMS_SINCE_OK = 5;
const MIN_DISTINCT_STORIES = 3;
const MIN_DISTINCT_SOURCES = 3;
const DRIFT_THRESHOLD = 0.7;
const BATCH_THESES = 10;
const MAX_CLAIMS_FOR_SUMMARY = 30;

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

type ThesisRow = {
  thesis_id: string;
  centroid_embedding: unknown;
  thesis_text_embedding: unknown;
  claim_count: number;
  thesis_text_ok: boolean;
  last_text_ok_claim_count: number;
};

type ClaimRow = {
  claim_id: string;
  canonical_text: string | null;
  embedding: unknown;
  created_at: string;
};

async function callThesisLLM(apiKey: string, model: string, claimTexts: string[]): Promise<string> {
  const system = `You write a single thesis sentence that captures the shared semantic pattern across the given claims.
The claims are ordered by centrality: the top claims are most representative of the core theme; the bottom claims are more peripheral. Prioritize the top claims when forming your sentence, but still try to capture the overall pattern across the full list.
Be descriptive, not causal or moralizing. Use timeframe only if it naturally emerges from the claims; do not invent dates.
Avoid over-specificity unless consistent across the claims.
Output exactly one sentence. No preamble. Do not browse the web.`;

  const userContent = `Claims (ordered by centrality, most representative first):\n${claimTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

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
        { role: "user", content: userContent },
      ],
      max_tokens: 150,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (data?.error) throw new Error(data.error.message ?? "OpenAI error");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Missing OpenAI content");
  return content.trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? DEFAULT_EMBEDDING_MODEL;
  const CHAT_MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

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
  const dryRun = Boolean(body.dry_run ?? false);
  const batchTheses = clampInt(body.batch_theses, 1, 20, BATCH_THESES);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: allCandidates, error: fetchErr } = await supabase
    .from("theses")
    .select("thesis_id, centroid_embedding, thesis_text_embedding, claim_count, thesis_text_ok, last_text_ok_claim_count")
    .not("centroid_embedding", "is", null);

  if (fetchErr) {
    console.error("[label_thesis] Fetch theses error:", fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const rows = (Array.isArray(allCandidates) ? allCandidates : []) as ThesisRow[];
  const eligible: Array<{ thesis: ThesisRow; discrepancy: number; newClaimsSinceOk: number }> = [];

  for (const t of rows) {
    const centroid = parseEmbedding(t.centroid_embedding);
    const textEmb = parseEmbedding(t.thesis_text_embedding);
    const claimCount = Number(t.claim_count) || 0;
    const lastOk = Number(t.last_text_ok_claim_count) || 0;
    const newClaimsSinceOk = claimCount - lastOk;

    let isEligible = false;
    let discrepancy = 1;

    if (textEmb == null && claimCount >= MIN_CLAIMS_FOR_TEXT) {
      isEligible = true;
      discrepancy = 1;
    } else if (t.thesis_text_ok === false) {
      isEligible = true;
      if (textEmb != null && centroid != null) {
        discrepancy = 1 - cosineSimilarity(centroid, textEmb);
      }
    } else if (
      t.thesis_text_ok === true &&
      newClaimsSinceOk >= MIN_NEW_CLAIMS_SINCE_OK &&
      textEmb != null &&
      centroid != null
    ) {
      const sim = cosineSimilarity(centroid, textEmb);
      if (sim < DRIFT_THRESHOLD) {
        isEligible = true;
        discrepancy = 1 - sim;
      }
    }

    if (isEligible) eligible.push({ thesis: t, discrepancy, newClaimsSinceOk });
  }

  if (eligible.length > 0) {
    const thesisIds = eligible.map((e) => e.thesis.thesis_id);
    const { data: rpcRows, error: rpcErr } = await supabase.rpc("get_thesis_claim_story_sources", {
      p_thesis_ids: thesisIds,
    });
    if (rpcErr) {
      console.error("[label_thesis] RPC get_thesis_claim_story_sources error:", rpcErr.message);
      return json({ error: rpcErr.message }, 500);
    }
    const rows = (Array.isArray(rpcRows) ? rpcRows : []) as Array<{
      thesis_id: string;
      claim_id: string;
      story_id: string;
      source_id: string;
    }>;
    const thesisStories = new Map<string, Set<string>>();
    const thesisSources = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!thesisStories.has(r.thesis_id)) {
        thesisStories.set(r.thesis_id, new Set());
        thesisSources.set(r.thesis_id, new Set());
      }
      thesisStories.get(r.thesis_id)!.add(r.story_id);
      thesisSources.get(r.thesis_id)!.add(r.source_id);
    }
    const thesisDistinctStories = new Map<string, number>([...thesisStories].map(([tid, s]) => [tid, s.size]));
    const thesisDistinctSources = new Map<string, number>([...thesisSources].map(([tid, s]) => [tid, s.size]));
    const before = eligible.length;
    eligible.splice(
      0,
      eligible.length,
      ...eligible.filter(
        (e) =>
          (thesisDistinctStories.get(e.thesis.thesis_id) ?? 0) >= MIN_DISTINCT_STORIES &&
          (thesisDistinctSources.get(e.thesis.thesis_id) ?? 0) >= MIN_DISTINCT_SOURCES
      )
    );
    if (eligible.length < before && before > 0) {
      console.log(
        `[label_thesis] Excluded ${before - eligible.length} theses (fewer than ${MIN_DISTINCT_STORIES} distinct stories or fewer than ${MIN_DISTINCT_SOURCES} distinct sources)`
      );
    }
  }

  eligible.sort((a, b) => {
    const aNull = parseEmbedding(a.thesis.thesis_text_embedding) == null ? 1 : 0;
    const bNull = parseEmbedding(b.thesis.thesis_text_embedding) == null ? 1 : 0;
    if (bNull !== aNull) return bNull - aNull;
    if (b.discrepancy !== a.discrepancy) return b.discrepancy - a.discrepancy;
    return b.newClaimsSinceOk - a.newClaimsSinceOk;
  });

  const toProcess = eligible.slice(0, batchTheses);
  if (toProcess.length === 0) {
    return json({
      ok: true,
      processed: 0,
      message: "No theses eligible for label",
      dry_run: dryRun,
    });
  }

  let processed = 0;
  let okCount = 0;

  for (const { thesis } of toProcess) {
    const thesisId = thesis.thesis_id;
    const centroid = parseEmbedding(thesis.centroid_embedding);
    if (!centroid) continue;

    const { data: linkRows } = await supabase
      .from("thesis_claims")
      .select("claim_id, created_at")
      .eq("thesis_id", thesisId);

    const linkMap = new Map<string, string>();
    for (const r of linkRows ?? []) {
      linkMap.set((r as { claim_id: string }).claim_id, (r as { created_at: string }).created_at);
    }
    const claimIds = [...linkMap.keys()];
    if (claimIds.length === 0) continue;

    const { data: claimRows } = await supabase
      .from("claims")
      .select("claim_id, canonical_text, embedding")
      .in("claim_id", claimIds);

    const claimsWithMeta = (claimRows ?? []).map((c) => ({
      claim_id: (c as { claim_id: string }).claim_id,
      canonical_text: (c as { canonical_text: string | null }).canonical_text ?? "",
      embedding: parseEmbedding((c as { embedding: unknown }).embedding),
      created_at: linkMap.get((c as { claim_id: string }).claim_id) ?? "",
    })) as Array<ClaimRow & { created_at: string; embedding: number[] | null }>;

    let selected: typeof claimsWithMeta;
    if (claimsWithMeta.length <= MAX_CLAIMS_FOR_SUMMARY) {
      selected = claimsWithMeta;
    } else {
      selected = [...claimsWithMeta]
        .filter((c) => c.embedding != null)
        .sort((a, b) => cosineSimilarity(b.embedding!, centroid) - cosineSimilarity(a.embedding!, centroid))
        .slice(0, MAX_CLAIMS_FOR_SUMMARY);
    }

    // Order by centrality (most central first) so the LLM prioritizes the core theme.
    selected = [...selected].sort((a, b) => {
      const aSim = a.embedding != null ? cosineSimilarity(a.embedding, centroid) : -1;
      const bSim = b.embedding != null ? cosineSimilarity(b.embedding, centroid) : -1;
      return bSim - aSim;
    });

    const claimTexts = selected.map((c) => (c.canonical_text || "").trim()).filter(Boolean);
    if (claimTexts.length === 0) continue;

    let thesisSentence: string;
    try {
      thesisSentence = await callThesisLLM(OPENAI_API_KEY, CHAT_MODEL, claimTexts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[label_thesis] LLM error:", msg);
      return json({ error: msg, thesis_id: thesisId }, 500);
    }

    let textEmbedding: number[];
    try {
      textEmbedding = await getEmbedding(OPENAI_API_KEY, thesisSentence, EMBEDDING_MODEL);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[label_thesis] Embedding error:", msg);
      return json({ error: msg, thesis_id: thesisId }, 500);
    }

    const similarityNew = cosineSimilarity(textEmbedding, centroid);
    const thesisTextOk = similarityNew >= DRIFT_THRESHOLD;

    processed += 1;
    if (thesisTextOk) okCount += 1;

    if (dryRun) continue;

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      thesis_text: thesisSentence,
      thesis_text_embedding: `[${textEmbedding.join(",")}]`,
      thesis_text_ok: thesisTextOk,
      last_text_written_at: now,
      updated_at: now,
    };
    if (thesisTextOk) {
      update.last_text_ok_claim_count = thesis.claim_count;
    }

    const { error: upErr } = await supabase
      .from("theses")
      .update(update)
      .eq("thesis_id", thesisId);

    if (upErr) {
      console.error("[label_thesis] Update error:", upErr.message);
      return json({ error: upErr.message, thesis_id: thesisId }, 500);
    }
  }

  return json({
    ok: true,
    processed,
    thesis_text_ok_count: okCount,
    dry_run: dryRun,
  });
});
