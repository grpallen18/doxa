// Supabase Edge Function: classify_agreement_cluster_relationships.
// LLM classification of dequeued agreement-cluster pair candidates.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Body: { max_pairs?: number, dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  VALID_CLUSTER_KINDS,
  type AgreementClusterRelationshipKind,
} from "../../../../lib/topology/relationship-taxonomy.ts";
import { clampInt, corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_PAIRS = 20;
const BATCH_SIZE = 5;

async function classifyBatch(
  apiKey: string,
  model: string,
  pairs: Array<{ labelA: string; labelB: string; summaryA: string; summaryB: string }>
): Promise<Array<{ relationship_kind: AgreementClusterRelationshipKind; reasoning?: string }>> {
  const system = `You classify relationships between agreement clusters (coherent sides in a debate).
For each pair output exactly one relationship_kind:
- opposed: direct opposition on the same question
- competing: rival frameworks or priorities
- compatible: can coexist without direct conflict
- orthogonal: different questions despite shared topic
- nested: one side is a subset of the other
- partially_overlapping: some shared ground, some conflict

REQUIRED: "reasoning" (1-2 sentences) per pair.
Output JSON array of exactly ${pairs.length} objects with "relationship_kind" and "reasoning".`;

  const blocks = pairs
    .map((p, i) => `Pair ${i + 1}:\nSide A: ${p.labelA}\n${p.summaryA}\nSide B: ${p.labelB}\n${p.summaryB}`)
    .join("\n\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: blocks },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content ?? "[]";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return pairs.map(() => ({ relationship_kind: "orthogonal" as AgreementClusterRelationshipKind, reasoning: "(parse failed)" }));
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : [];

  return pairs.map((_, i) => {
    const o = arr[i] as { relationship_kind?: string; reasoning?: string } | undefined;
    const kind = VALID_CLUSTER_KINDS.includes((o?.relationship_kind ?? "") as AgreementClusterRelationshipKind)
      ? (o!.relationship_kind as AgreementClusterRelationshipKind)
      : "orthogonal";
    return { relationship_kind: kind, reasoning: o?.reasoning ?? "" };
  });
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_MODEL;

  if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
    return json({ error: "Missing env vars" }, 500);
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

  const maxPairs = clampInt(body.max_pairs, 1, 30, MAX_PAIRS);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const { data: candidates, error: candErr } = await supabase.rpc("dequeue_agreement_cluster_pair_candidates", {
    p_limit: maxPairs,
  });
  if (candErr) return json({ error: candErr.message }, 500);

  const rows = (candidates ?? []) as Array<{
    agreement_cluster_a_id: string;
    agreement_cluster_b_id: string;
    signals: Record<string, unknown>;
  }>;

  if (rows.length === 0) {
    return json({ ok: true, pairs_classified: 0, message: "No pending cluster candidates" });
  }

  const clusterIds = [...new Set(rows.flatMap((r) => [r.agreement_cluster_a_id, r.agreement_cluster_b_id]))];
  const { data: clusterRows } = await supabase
    .from("agreement_clusters")
    .select("agreement_cluster_id, label, summary")
    .in("agreement_cluster_id", clusterIds);

  const metaByCluster = new Map<string, { label: string; summary: string }>();
  for (const c of clusterRows ?? []) {
    const id = c.agreement_cluster_id as string;
    metaByCluster.set(id, {
      label: (c.label as string) ?? "Side",
      summary: (c.summary as string) ?? "",
    });
  }

  for (const cid of clusterIds) {
    if (metaByCluster.has(cid) && metaByCluster.get(cid)!.summary) continue;
    const { data: posRows } = await supabase
      .from("agreement_cluster_positions")
      .select("canonical_positions(canonical_text)")
      .eq("agreement_cluster_id", cid)
      .eq("membership_kind", "core")
      .limit(3);
    const texts = (posRows ?? [])
      .map((r) => ((r.canonical_positions as { canonical_text?: string } | null)?.canonical_text ?? "").slice(0, 120))
      .filter(Boolean);
    metaByCluster.set(cid, {
      label: metaByCluster.get(cid)?.label ?? texts[0]?.slice(0, 60) ?? "Side",
      summary: metaByCluster.get(cid)?.summary || texts.join("; "),
    });
  }

  type PairRow = { a: string; b: string; signals: Record<string, unknown> };
  const pairs: PairRow[] = rows.map((r) => ({
    a: r.agreement_cluster_a_id,
    b: r.agreement_cluster_b_id,
    signals: r.signals ?? {},
  }));

  let classified = 0;

  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);
    let results: Array<{ relationship_kind: AgreementClusterRelationshipKind; reasoning?: string }>;
    try {
      results = await classifyBatch(
        OPENAI_API_KEY,
        MODEL,
        batch.map((p) => {
          const ma = metaByCluster.get(p.a)!;
          const mb = metaByCluster.get(p.b)!;
          return { labelA: ma.label, labelB: mb.label, summaryA: ma.summary, summaryB: mb.summary };
        })
      );
    } catch (e) {
      console.error("[classify_agreement_cluster_relationships] LLM error:", e);
      results = batch.map(() => ({ relationship_kind: "orthogonal" as AgreementClusterRelationshipKind, reasoning: "(LLM error)" }));
    }

    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const r = results[j];
      if (dryRun) continue;

      const { data: ins, error: insErr } = await supabase
        .from("agreement_cluster_relationships")
        .upsert(
          {
            agreement_cluster_a_id: p.a,
            agreement_cluster_b_id: p.b,
            relationship_kind: r.relationship_kind,
            rationale: r.reasoning ?? null,
            confidence: 0.8,
            signals: p.signals,
            classified_at: new Date().toISOString(),
            model: MODEL,
          },
          { onConflict: "agreement_cluster_a_id,agreement_cluster_b_id" }
        )
        .select("agreement_cluster_relationship_id")
        .single();

      if (insErr) {
        console.error("[classify_agreement_cluster_relationships] upsert error:", insErr.message);
        continue;
      }

      await supabase
        .from("agreement_cluster_pair_candidates")
        .update({ status: "classified" })
        .eq("agreement_cluster_a_id", p.a)
        .eq("agreement_cluster_b_id", p.b);

      classified += 1;
      void ins;
    }
  }

  return json({ ok: true, pairs_dequeued: rows.length, pairs_classified: classified, dry_run: dryRun });
};
