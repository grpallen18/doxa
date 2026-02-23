// Supabase Edge Function: generate_viewpoints.
// LLM generates viewpoint summary per (controversy, position). New-only, positions with summaries.
// Drift check: only persist when similarity(summary embedding, position centroid) >= threshold.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL, DRIFT_THRESHOLD.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean, max_viewpoints?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_MAX_VIEWPOINTS = 25;
const BATCH_SIZE = 6; // viewpoints per LLM call

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

type ViewpointInput = {
  controversy_cluster_id: string;
  position_cluster_id: string;
  stance_label: string;
  question: string;
  claimTexts: string[];
};

async function generateViewpointBatch(
  apiKey: string,
  model: string,
  inputs: ViewpointInput[]
): Promise<string[]> {
  const blocks = inputs
    .map(
      (inp, i) =>
        `Viewpoint ${i + 1} - Debate question: ${inp.question}\nThis side (${inp.stance_label}):\n${inp.claimTexts.slice(0, 6).map((t, j) => `${j + 1}. ${t}`).join("\n")}`
    )
    .join("\n\n");

  const system = `Given multiple debate questions and each side's claims below, produce a JSON array with one summary per viewpoint: ["summary1", "summary2", ...]
Each summary should be 2-4 sentences, read as "This side argues that...", factual and neutral.`;

  const user = `${blocks}\n\nOutput only the JSON array of strings. No preamble.`;

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
      max_tokens: Math.min(4000, 300 * inputs.length + 500),
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data?.choices?.[0]?.message?.content ?? "").trim();
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return inputs.map(() => "No viewpoint.");
    }
    return parsed.map((s, i) =>
      (typeof s === "string" ? s : String(s ?? "No viewpoint.")).trim().slice(0, 2000)
    );
  } catch {
    return inputs.map(() => content.slice(0, 2000) || "No viewpoint.");
  }
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

  // Links without viewpoint yet; controversy active; position has label (summary exists)
  const { data: links } = await supabase
    .from("controversy_cluster_positions")
    .select("controversy_cluster_id, position_cluster_id, stance_label");

  const allLinks = (links ?? []) as Array<{
    controversy_cluster_id: string;
    position_cluster_id: string;
    stance_label: string | null;
  }>;

  const { data: existingViewpoints } = await supabase
    .from("controversy_viewpoints")
    .select("controversy_cluster_id, position_cluster_id");
  const existingSet = new Set(
    (existingViewpoints ?? []).map(
      (r) => `${(r as { controversy_cluster_id: string }).controversy_cluster_id}:${(r as { position_cluster_id: string }).position_cluster_id}`
    )
  );

  const { data: controversies } = await supabase
    .from("controversy_clusters")
    .select("controversy_cluster_id, question")
    .eq("status", "active");
  const questionByControversy = new Map(
    (controversies ?? []).map((r) => [
      (r as { controversy_cluster_id: string }).controversy_cluster_id,
      (r as { question?: string }).question ?? "What is the debate?",
    ])
  );

  const { data: positions } = await supabase
    .from("position_clusters")
    .select("position_cluster_id, label")
    .eq("status", "active")
    .not("label", "is", null);
  const labelByPosition = new Map(
    (positions ?? []).map((r) => [
      (r as { position_cluster_id: string }).position_cluster_id,
      (r as { label?: string }).label ?? "This position",
    ])
  );

  const viewpointCountByControversy = new Map<string, number>();
  for (const r of existingViewpoints ?? []) {
    const cid = (r as { controversy_cluster_id: string }).controversy_cluster_id;
    viewpointCountByControversy.set(cid, (viewpointCountByControversy.get(cid) ?? 0) + 1);
  }

  const items = allLinks
    .filter(
      (l) =>
        !existingSet.has(`${l.controversy_cluster_id}:${l.position_cluster_id}`) &&
        questionByControversy.has(l.controversy_cluster_id) &&
        labelByPosition.has(l.position_cluster_id)
    )
    .sort((a, b) => {
      const countA = viewpointCountByControversy.get(a.controversy_cluster_id) ?? 0;
      const countB = viewpointCountByControversy.get(b.controversy_cluster_id) ?? 0;
      if (countA !== countB) return countA - countB;
      if (a.controversy_cluster_id !== b.controversy_cluster_id) {
        return a.controversy_cluster_id.localeCompare(b.controversy_cluster_id);
      }
      return a.position_cluster_id.localeCompare(b.position_cluster_id);
    })
    .slice(0, maxViewpoints);

  if (items.length === 0) {
    return json({ ok: true, created: 0, message: "No controversy-position links needing viewpoints" });
  }

  if (dryRun) {
    return json({ ok: true, would_create: items.length, dry_run: true });
  }

  // Build inputs with claim texts for each item
  const toProcess: ViewpointInput[] = [];
  for (const item of items) {
    const question = questionByControversy.get(item.controversy_cluster_id) ?? "What is the debate?";
    const stanceLabel = labelByPosition.get(item.position_cluster_id) ?? item.stance_label ?? "This position";

    const { data: members } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", item.position_cluster_id)
      .limit(8);
    const claimIds = (members ?? []).map((r) => (r as { claim_id: string }).claim_id);

    let claimTexts: string[] = [];
    if (claimIds.length > 0) {
      const { data: claimRows } = await supabase.from("claims").select("canonical_text").in("claim_id", claimIds);
      claimTexts = (claimRows ?? [])
        .map((r) => ((r as { canonical_text?: string }).canonical_text ?? "").slice(0, 250))
        .filter(Boolean);
    }

    toProcess.push({
      controversy_cluster_id: item.controversy_cluster_id,
      position_cluster_id: item.position_cluster_id,
      stance_label: stanceLabel,
      question,
      claimTexts,
    });
  }

  let created = 0;
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);
    try {
      const summaries = await generateViewpointBatch(OPENAI_API_KEY, MODEL, batch);

      // Batch fetch centroids for drift check
      const posIds = batch.map((b) => b.position_cluster_id);
      const { data: centroidRows } = await supabase
        .from("position_clusters")
        .select("position_cluster_id, centroid_embedding")
        .in("position_cluster_id", posIds);

      const centroidByPos = new Map<string, number[]>();
      for (const row of centroidRows ?? []) {
        const emb = parseEmbedding((row as { centroid_embedding?: unknown }).centroid_embedding);
        if (emb && emb.length > 0) {
          centroidByPos.set((row as { position_cluster_id: string }).position_cluster_id, emb);
        }
      }

      // Batch embed summaries for drift check
      const summaryTexts = batch.map((_, j) => summaries[j] ?? "No viewpoint.").slice(0, batch.length);
      let summaryEmbeddings: number[][] = [];
      try {
        summaryEmbeddings = await getEmbeddingsBatch(OPENAI_API_KEY, summaryTexts, EMBEDDING_MODEL);
      } catch (e) {
        console.error("[generate_viewpoints] Embed batch:", e);
      }

      for (let j = 0; j < batch.length; j++) {
        const inp = batch[j];
        const summary = summaries[j] ?? "No viewpoint.";
        const centroid = centroidByPos.get(inp.position_cluster_id);
        const summaryEmb = summaryEmbeddings[j];

        // Drift check: only persist if similarity >= threshold
        if (!centroid || !summaryEmb || summaryEmb.length !== centroid.length) {
          continue; // Skip: no centroid or invalid embedding
        }
        const sim = cosineSimilarity(summaryEmb, centroid);
        if (sim < driftThreshold) {
          continue; // Skip; viewpoint stays eligible for next run
        }

        await supabase.from("controversy_viewpoints").upsert(
          {
            controversy_cluster_id: inp.controversy_cluster_id,
            position_cluster_id: inp.position_cluster_id,
            title: inp.stance_label,
            summary,
            summary_ok: true,
            version: 1,
            model: MODEL,
          },
          { onConflict: "controversy_cluster_id,position_cluster_id" }
        );
        created++;
      }
    } catch (e) {
      console.error("[generate_viewpoints] LLM batch:", e);
    }
  }

  return json({ ok: true, created });
});
