// Supabase Edge Function: build_controversy_clusters.
// Multi-sided controversies from opposed/competing agreement-cluster relationships.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL, OPENAI_EMBEDDING_MODEL.
// Body: { dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assembleControversyComponents,
  type ClusterEdge,
} from "../../../../lib/topology/controversy-assembly.ts";
import { isStrongControversyEdge, type AgreementClusterRelationshipKind } from "../../../../lib/topology/relationship-taxonomy.ts";
import { corsHeaders, json, sha256Hex } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_EMBEDDING_DIMS = 1536;

async function getEmbedding(apiKey: string, text: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, model }),
  });
  if (!resp.ok) throw new Error(`OpenAI embeddings ${resp.status}`);
  const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DEFAULT_EMBEDDING_DIMS) throw new Error("Invalid embedding");
  return emb;
}

async function generateQuestion(apiKey: string, model: string, labels: string[]): Promise<string> {
  const system = `Generate a neutral debate question that these sides answer differently. One sentence max.`;
  const user = `Sides: ${labels.join("; ")}\n\nNeutral question:`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 80,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data?.choices?.[0]?.message?.content ?? "What is the debate?").trim().slice(0, 500);
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;
  const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? DEFAULT_EMBEDDING_MODEL;

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
    /* defaults */
  }
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: relRows } = await supabase
    .from("agreement_cluster_relationships")
    .select("agreement_cluster_relationship_id, agreement_cluster_a_id, agreement_cluster_b_id, relationship_kind");

  const { data: clusterRows } = await supabase
    .from("agreement_clusters")
    .select("agreement_cluster_id, topic_id, label")
    .eq("status", "active");

  const topicByCluster = new Map<string, string>();
  const labelByCluster = new Map<string, string>();
  for (const r of clusterRows ?? []) {
    const id = r.agreement_cluster_id as string;
    topicByCluster.set(id, r.topic_id as string);
    labelByCluster.set(id, (r.label as string) ?? "Side");
  }

  const edges: ClusterEdge[] = [];
  for (const r of relRows ?? []) {
    const kind = r.relationship_kind as AgreementClusterRelationshipKind;
    if (!isStrongControversyEdge(kind)) continue;
    edges.push({
      a: r.agreement_cluster_a_id as string,
      b: r.agreement_cluster_b_id as string,
      kind,
      relationshipId: r.agreement_cluster_relationship_id as string,
    });
  }

  const components = assembleControversyComponents(edges, topicByCluster);

  if (dryRun) {
    return json({ ok: true, controversy_components: components.length, dry_run: true });
  }

  const pControversies: Array<{
    fingerprint: string;
    topic_id: string;
    question: string;
    label: string;
    question_embedding: string;
    positions: Array<{ agreement_cluster_id: string; stance_label: string }>;
    lineage_relationship_ids: string[];
  }> = [];

  for (const comp of components) {
    const labels = comp.clusterIds.map((id) => labelByCluster.get(id) ?? "Side");
    const question = OPENAI_API_KEY ? await generateQuestion(OPENAI_API_KEY, MODEL, labels) : "What is the debate?";
    const embedding = OPENAI_API_KEY ? await getEmbedding(OPENAI_API_KEY, question, EMBEDDING_MODEL) : [];
    const embeddingStr = embedding.length > 0 ? `[${embedding.join(",")}]` : "";
    const fingerprint = await sha256Hex(comp.clusterIds.join("|"));

    pControversies.push({
      fingerprint,
      topic_id: comp.topicId,
      question,
      label: question,
      question_embedding: embeddingStr,
      positions: comp.clusterIds.map((id, idx) => ({
        agreement_cluster_id: id,
        stance_label: labels[idx] ?? `Side ${idx + 1}`,
      })),
      lineage_relationship_ids: comp.edgeRelationshipIds,
    });
  }

  if (pControversies.length > 0) {
    const { error: contErr } = await supabase.rpc("upsert_controversy_clusters_batch", {
      p_controversies: pControversies,
    });
    if (contErr) {
      console.error("[build_controversy_clusters] upsert error:", contErr.message);
      return json({ error: contErr.message }, 500);
    }
  }

  return json({ ok: true, controversy_clusters: pControversies.length });
};
