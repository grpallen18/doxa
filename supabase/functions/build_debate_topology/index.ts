// Supabase Edge Function: build agreements and controversies from position_relationships.
// Replaces build_position_clusters + aggregate_position_pair_scores + build_controversy_clusters.
// UnionFind on agree edges; conflict edges -> controversies.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_AGREEMENT_SIZE = 2;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;

class UnionFind {
  private parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string) {
    const px = this.find(x);
    const py = this.find(y);
    if (px !== py) this.parent.set(py, px);
  }

  getComponents(): Map<string, string[]> {
    const comp: Map<string, string[]> = new Map();
    for (const [x] of this.parent) {
      const root = this.find(x);
      if (!comp.has(root)) comp.set(root, []);
      comp.get(root)!.push(x);
    }
    return comp;
  }
}

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

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) throw new Error(`OpenAI embeddings ${resp.status}`);
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) throw new Error("Invalid embedding");
  return emb;
}

async function generateQuestion(
  apiKey: string,
  model: string,
  labels: string[]
): Promise<string> {
  const system = `Generate a neutral debate question that these positions answer differently. One sentence max. No preamble.`;
  const user = `Positions: ${labels.join("; ")}\n\nNeutral question:`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 80 }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "What is the debate?").trim().slice(0, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: agreeRows } = await supabase
    .from("position_relationships")
    .select("position_a_id, position_b_id")
    .in("relation", ["direct", "indirect"])
    .eq("alignment", "agree");

  const { data: posTopics } = await supabase
    .from("canonical_positions")
    .select("canonical_position_id, primary_topic_id")
    .not("primary_topic_id", "is", null);

  const topicByPos = new Map<string, string>();
  for (const r of posTopics ?? []) {
    const pid = (r as { canonical_position_id: string }).canonical_position_id;
    const tid = (r as { primary_topic_id: string }).primary_topic_id;
    topicByPos.set(pid, tid);
  }

  const uf = new UnionFind();
  for (const r of agreeRows ?? []) {
    const a = (r as { position_a_id: string }).position_a_id;
    const b = (r as { position_b_id: string }).position_b_id;
    const ta = topicByPos.get(a);
    const tb = topicByPos.get(b);
    if (ta && tb && ta === tb) uf.union(a, b);
  }

  const components = uf.getComponents();
  const agreementClusters: Array<{ topic_id: string; canonical_position_ids: string[] }> = [];

  for (const [, members] of components) {
    const unique = [...new Set(members)];
    if (unique.length < MIN_AGREEMENT_SIZE) continue;
    const topicId = topicByPos.get(unique[0]);
    if (!topicId) continue;
    agreementClusters.push({ topic_id: topicId, canonical_position_ids: unique });
  }

  if (dryRun) {
    return json({ ok: true, agreement_clusters: agreementClusters.length, dry_run: true });
  }

  const pClusters = await Promise.all(
    agreementClusters.map(async (c) => {
      const sorted = [...c.canonical_position_ids].sort();
      const fingerprint = await sha256Hex(sorted.join("|"));
      return {
        fingerprint,
        topic_id: c.topic_id,
        canonical_position_ids: sorted,
      };
    })
  );

  const { error: agreeErr } = await supabase.rpc("upsert_agreement_clusters_batch", {
    p_clusters: pClusters,
  });
  if (agreeErr) {
    console.error("[build_debate_topology] upsert_agreement_clusters_batch:", agreeErr.message);
    return json({ error: agreeErr.message }, 500);
  }

  const { error: centroidErr } = await supabase.rpc("compute_agreement_centroids");
  if (centroidErr) {
    console.warn("[build_debate_topology] compute_agreement_centroids:", centroidErr.message);
  }

  const { data: agreementRows } = await supabase
    .from("agreement_clusters")
    .select("agreement_cluster_id, topic_id, membership_fingerprint")
    .eq("status", "active");

  const { data: conflictRows } = await supabase
    .from("position_relationships")
    .select("position_a_id, position_b_id")
    .in("relation", ["direct", "indirect"])
    .eq("alignment", "conflict");

  const agreementByFp = new Map<string, string>();
  const topicByAgreement = new Map<string, string>();
  for (const r of agreementRows ?? []) {
    const aid = (r as { agreement_cluster_id: string }).agreement_cluster_id;
    const fp = (r as { membership_fingerprint: string }).membership_fingerprint;
    const tid = (r as { topic_id: string }).topic_id;
    if (fp) agreementByFp.set(fp, aid);
    topicByAgreement.set(aid, tid ?? "");
  }

  const posToAgreement = new Map<string, string>();
  for (const c of agreementClusters) {
    const sorted = [...c.canonical_position_ids].sort();
    const fp = await sha256Hex(sorted.join("|"));
    const aid = agreementByFp.get(fp);
    if (aid) {
      for (const pid of c.canonical_position_ids) {
        posToAgreement.set(pid, aid);
      }
    }
  }

  const controversyPairs: Array<{ aidA: string; aidB: string; topicId: string }> = [];
  const seen = new Set<string>();

  for (const r of conflictRows ?? []) {
    const pa = (r as { position_a_id: string }).position_a_id;
    const pb = (r as { position_b_id: string }).position_b_id;
    const aidA = posToAgreement.get(pa);
    const aidB = posToAgreement.get(pb);
    if (!aidA || !aidB || aidA === aidB) continue;
    const topicId = topicByAgreement.get(aidA);
    if (!topicId || topicByAgreement.get(aidB) !== topicId) continue;
    const key = [aidA, aidB].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    controversyPairs.push({ aidA, aidB, topicId });
  }

  const { data: agreementLabels } = await supabase
    .from("agreement_clusters")
    .select("agreement_cluster_id, label");

  const labelByAgreement = new Map<string, string>();
  for (const r of agreementLabels ?? []) {
    const aid = (r as { agreement_cluster_id: string }).agreement_cluster_id;
    const lbl = (r as { label?: string }).label ?? "Position";
    labelByAgreement.set(aid, lbl);
  }

  const pControversies: Array<{
    fingerprint: string;
    topic_id: string;
    question: string;
    label: string;
    question_embedding: string;
    positions: Array<{ agreement_cluster_id: string; stance_label: string }>;
  }> = [];

  for (const p of controversyPairs) {
    const labels = [
      labelByAgreement.get(p.aidA) ?? "Side A",
      labelByAgreement.get(p.aidB) ?? "Side B",
    ];
    const question = OPENAI_API_KEY ? await generateQuestion(OPENAI_API_KEY, MODEL, labels) : "What is the debate?";
    const embedding = OPENAI_API_KEY ? await getEmbedding(OPENAI_API_KEY, question, EMBEDDING_MODEL) : [];
    const embeddingStr = embedding.length > 0 ? `[${embedding.join(",")}]` : "";

    const posIds = [p.aidA, p.aidB].sort();
    const fingerprint = await sha256Hex(posIds.join("|"));

    pControversies.push({
      fingerprint,
      topic_id: p.topicId,
      question,
      label: question,
      question_embedding: embeddingStr,
      positions: [
        { agreement_cluster_id: p.aidA, stance_label: labels[0] },
        { agreement_cluster_id: p.aidB, stance_label: labels[1] },
      ],
    });
  }

  if (pControversies.length > 0) {
    const { error: contErr } = await supabase.rpc("upsert_controversy_clusters_batch", {
      p_controversies: pControversies,
    });
    if (contErr) {
      console.error("[build_debate_topology] upsert_controversy_clusters_batch:", contErr.message);
    }
  }

  return json({
    ok: true,
    agreement_clusters: agreementClusters.length,
    controversy_clusters: controversyPairs.length,
  });
});
