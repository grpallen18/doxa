// Supabase Edge Function: claim_cluster_nightly.
// Two-stage clustering (similarity + contradiction), controversy scoring, cluster labels.
// Replaces claim_to_thesis and label_thesis. One bounded batch per invocation.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY. Optional: OPENAI_MODEL.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { max_claims?: number, dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIM_THRESHOLD = 0.65; // Wider net for competing claims (less similar than reinforcing); LLM filters in Stage 2
const K = 20;
const MAX_CLAIMS_PER_RUN = 25; // Keeps LLM phase under ~45s; override via body.max_claims if needed
const LLM_PARALLEL_BATCH = 8; // Max concurrent LLM calls to avoid rate limits and timeout
const MIN_CLUSTER_SIZE = 2;
const MAX_CLUSTER_SIZE = 50;
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const ELIGIBLE_DAYS = 7;

type Relationship = "supports_same_position" | "contradicts" | "orthogonal" | "competing_framing";

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

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
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

function embeddingToStr(emb: number[]): string {
  return `[${emb.join(",")}]`;
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

// Union-Find for connected components
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    const rx = this.rank.get(px) ?? 0;
    const ry = this.rank.get(py) ?? 0;
    if (rx < ry) this.parent.set(px, py);
    else if (rx > ry) this.parent.set(py, px);
    else {
      this.parent.set(py, px);
      this.rank.set(px, rx + 1);
    }
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

async function classifyRelationship(
  apiKey: string,
  model: string,
  claimA: string,
  claimB: string
): Promise<Relationship> {
  const system = `Classify the relationship between two claims. Return exactly one of: supports_same_position, contradicts, orthogonal, competing_framing.
- supports_same_position: Both claims assert the same or reinforcing positions.
- contradicts: One claim directly contradicts the other.
- orthogonal: Claims address different questions or are unrelated.
- competing_framing: Claims answer the same underlying question differently (competing framings, not direct contradiction).
Output only the single word. No preamble.`;

  const user = `Claim A: ${claimA}\n\nClaim B: ${claimB}`;

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
      max_tokens: 30,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = (data?.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
  const match = content.match(/(supports_same_position|contradicts|orthogonal|competing_framing)/);
  return (match ? match[1] : "orthogonal") as Relationship;
}

async function generateClusterLabel(apiKey: string, model: string, claimTexts: string[]): Promise<string> {
  const system = `Given these competing claims, generate a neutral question that they answer differently.
One sentence max. No preamble. Avoid bias toward any claim.`;

  const user = `Claims:\n${claimTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;

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
  return (data?.choices?.[0]?.message?.content ?? "Competing claims").trim().slice(0, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
  const MODEL = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_CHAT_MODEL;

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
    /* use defaults */
  }
  const maxClaims = clampInt(body.max_claims, 1, 100, MAX_CLAIMS_PER_RUN);
  const dryRun = Boolean(body.dry_run ?? false);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Eligible claims: cluster_computed_at null or older than ELIGIBLE_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ELIGIBLE_DAYS);
  const cutoffStr = cutoff.toISOString();

  const { data: eligibleRows, error: eligErr } = await supabase
    .from("claims")
    .select("claim_id, canonical_text, embedding")
    .not("embedding", "is", null)
    .or(`cluster_computed_at.is.null,cluster_computed_at.lt.${cutoffStr}`)
    .order("cluster_computed_at", { ascending: true, nullsFirst: true })
    .limit(maxClaims);

  if (eligErr) {
    console.error("[claim_cluster_nightly] Eligible claims fetch:", eligErr.message);
    return json({ error: eligErr.message }, 500);
  }

  const eligibleClaims = (eligibleRows ?? []).filter(
    (r): r is { claim_id: string; canonical_text: string | null; embedding: unknown } =>
      typeof r === "object" && r !== null && typeof (r as { claim_id: unknown }).claim_id === "string"
  );

  if (eligibleClaims.length === 0) {
    return json({
      ok: true,
      processed: 0,
      message: "No eligible claims to process",
      dry_run: dryRun,
    });
  }

  // Stage 1 + 2: For each claim, get neighbors, collect uncached pairs, then classify in parallel batches
  const processedClaimIds = new Set<string>();
  type PendingPair = { a: string; b: string; textA: string; textB: string; similarity: number };
  const pendingPairs: PendingPair[] = [];

  for (const claim of eligibleClaims) {
    const claimId = claim.claim_id;
    const emb = parseEmbedding(claim.embedding);
    if (!emb || emb.length === 0) continue;

    const embeddingStr = embeddingToStr(emb);
    const { data: matchRows, error: rpcErr } = await supabase.rpc("match_claims_nearest", {
      query_embedding: embeddingStr,
      match_count: K + 1, // +1 in case self is in results
    });

    if (rpcErr) {
      console.error("[claim_cluster_nightly] match_claims_nearest:", rpcErr.message);
      continue;
    }

    const matches = (Array.isArray(matchRows) ? matchRows : []) as Array<{ claim_id: string; distance: number }>;
    const neighbors = matches
      .filter((m) => m.claim_id !== claimId)
      .map((m) => ({ claim_id: m.claim_id, similarity: 1 - m.distance }))
      .filter((m) => m.similarity >= SIM_THRESHOLD)
      .slice(0, K);

    if (neighbors.length === 0) continue;

    const textA = (claim.canonical_text ?? "").trim().slice(0, 500);

    for (const nb of neighbors) {
      const [a, b] = claimId < nb.claim_id ? [claimId, nb.claim_id] : [nb.claim_id, claimId];

      const { data: existing } = await supabase
        .from("claim_relationships")
        .select("relationship")
        .eq("claim_a_id", a)
        .eq("claim_b_id", b)
        .maybeSingle();

      if (existing) continue; // cached

      const { data: claimBRow } = await supabase
        .from("claims")
        .select("canonical_text")
        .eq("claim_id", nb.claim_id)
        .single();

      const textB = ((claimBRow as { canonical_text?: string } | null)?.canonical_text ?? "").trim().slice(0, 500);
      pendingPairs.push({ a, b, textA, textB, similarity: nb.similarity });
    }

    processedClaimIds.add(claimId);
  }

  // Classify pending pairs in parallel batches
  for (let i = 0; i < pendingPairs.length; i += LLM_PARALLEL_BATCH) {
    const batch = pendingPairs.slice(i, i + LLM_PARALLEL_BATCH);
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          return await classifyRelationship(OPENAI_API_KEY, MODEL, p.textA, p.textB);
        } catch (e) {
          console.error("[claim_cluster_nightly] LLM classify:", e);
          return "orthogonal" as Relationship;
        }
      })
    );

    if (!dryRun && batch.length > 0) {
      const rows = batch.map((p, j) => ({
        claim_a_id: p.a,
        claim_b_id: p.b,
        relationship: results[j],
        similarity_at_classification: p.similarity,
        classified_at: new Date().toISOString(),
      }));
      await supabase.from("claim_relationships").upsert(rows, { onConflict: "claim_a_id,claim_b_id" });
    }
  }

  // Stage 3: Build graph from full claim_relationships, find components
  const { data: relRows, error: relErr } = await supabase
    .from("claim_relationships")
    .select("claim_a_id, claim_b_id, relationship, similarity_at_classification")
    .in("relationship", ["contradicts", "competing_framing"]);

  if (relErr) {
    console.error("[claim_cluster_nightly] claim_relationships fetch:", relErr.message);
    return json({ error: relErr.message, processed: processedClaimIds.size }, 500);
  }

  const uf = new UnionFind();
  const simMap = new Map<string, number>();
  for (const r of relRows ?? []) {
    const a = (r as { claim_a_id: string }).claim_a_id;
    const b = (r as { claim_b_id: string }).claim_b_id;
    const sim = (r as { similarity_at_classification?: number }).similarity_at_classification ?? 0.5;
    if (sim >= SIM_THRESHOLD) {
      uf.union(a, b);
      simMap.set(pairKey(a, b), sim);
    }
  }

  const components = uf.getComponents();

  // Filter: MIN_CLUSTER_SIZE >= 2, split if > MAX_CLUSTER_SIZE
  const clusters: string[][] = [];
  for (const [, members] of components) {
    const unique = [...new Set(members)];
    if (unique.length < MIN_CLUSTER_SIZE) continue;
    if (unique.length <= MAX_CLUSTER_SIZE) {
      clusters.push(unique);
    } else {
      // Simple split: take first MAX_CLUSTER_SIZE, then chunk the rest
      for (let i = 0; i < unique.length; i += MAX_CLUSTER_SIZE) {
        const chunk = unique.slice(i, i + MAX_CLUSTER_SIZE);
        if (chunk.length >= MIN_CLUSTER_SIZE) clusters.push(chunk);
      }
    }
  }

  if (dryRun) {
    return json({
      ok: true,
      processed: processedClaimIds.size,
      clusters_found: clusters.length,
      dry_run: true,
    });
  }

  // Fetch support counts per claim (story_claims count, distinct sources via stories)
  const allClaimIds = [...new Set(clusters.flat())];
  const supportMap = new Map<string, { support_count: number; distinct_source_count: number }>();

  const { data: scRows } = await supabase
    .from("story_claims")
    .select("claim_id, story_id")
    .in("claim_id", allClaimIds)
    .not("claim_id", "is", null);

  const storyIds = [...new Set((scRows ?? []).map((r) => (r as { story_id: string }).story_id))];
  const storyToSource = new Map<string, string>();
  if (storyIds.length > 0) {
    const { data: storyRows } = await supabase
      .from("stories")
      .select("story_id, source_id")
      .in("story_id", storyIds);
    for (const s of storyRows ?? []) {
      storyToSource.set((s as { story_id: string }).story_id, (s as { source_id: string }).source_id);
    }
  }

  const byClaim = new Map<string, { stories: Set<string>; sources: Set<string> }>();
  for (const r of scRows ?? []) {
    const cid = (r as { claim_id: string }).claim_id;
    const sid = (r as { story_id: string }).story_id;
    const src = storyToSource.get(sid);
    if (!cid) continue;
    if (!byClaim.has(cid)) byClaim.set(cid, { stories: new Set(), sources: new Set() });
    byClaim.get(cid)!.stories.add(sid);
    if (src) byClaim.get(cid)!.sources.add(src);
  }
  for (const [cid, v] of byClaim) {
    supportMap.set(cid, { support_count: v.stories.size, distinct_source_count: v.sources.size });
  }

  // Upsert clusters by fingerprint, compute controversy, labels
  const keptClusterIds: string[] = [];

  for (const memberIds of clusters) {
    const sorted = [...memberIds].sort();
    const fpInput = sorted.join("|");
    const fingerprint = await sha256Hex(fpInput);

    const totalSupport = memberIds.reduce((s, cid) => s + (supportMap.get(cid)?.support_count ?? 0), 0);
    const clusterSourceIds = new Set<string>();
    for (const r of scRows ?? []) {
      const cid = (r as { claim_id: string }).claim_id;
      if (!memberIds.includes(cid)) continue;
      const sid = (r as { story_id: string }).story_id;
      const src = storyToSource.get(sid);
      if (src) clusterSourceIds.add(src);
    }
    const distinctSourceCount = clusterSourceIds.size;

    const supports = memberIds.map((cid) => supportMap.get(cid)?.support_count ?? 0);
    const topSupport = Math.max(...supports, 0);
    const dominanceRatio = totalSupport > 0 ? topSupport / totalSupport : 0;

    let entropy = 0;
    const n = memberIds.length;
    for (const s of supports) {
      const p = totalSupport > 0 ? s / totalSupport : 0;
      if (p > 0) entropy -= p * Math.log(p);
    }
    const normalizedEntropy = n > 1 ? entropy / Math.log(n) : 0;
    const sourceDiversityScore = Math.min(1, distinctSourceCount / 10);
    const controversyScore =
      0.5 * normalizedEntropy +
      0.3 * sourceDiversityScore -
      0.2 * dominanceRatio;

    const { data: embRows } = await supabase
      .from("claims")
      .select("embedding")
      .in("claim_id", memberIds)
      .not("embedding", "is", null);

    const embeddings = (embRows ?? [])
      .map((r) => parseEmbedding((r as { embedding: unknown }).embedding))
      .filter((e): e is number[] => e !== null && e.length > 0);

    let centroid: number[] | null = null;
    if (embeddings.length > 0) {
      const dim = embeddings[0].length;
      centroid = new Array(dim).fill(0);
      for (const e of embeddings) {
        for (let i = 0; i < dim; i++) centroid[i] += e[i];
      }
      const mag = Math.sqrt(centroid.reduce((s, x) => s + x * x, 0));
      if (mag > 0) for (let i = 0; i < dim; i++) centroid[i] /= mag;
    }

    const { data: existingCluster } = await supabase
      .from("claim_clusters")
      .select("cluster_id")
      .eq("cluster_fingerprint", fingerprint)
      .maybeSingle();

    let clusterId: string;
    if (existingCluster) {
      clusterId = (existingCluster as { cluster_id: string }).cluster_id;
      await supabase
        .from("claim_clusters")
        .update({
          centroid_embedding: centroid ? embeddingToStr(centroid) : null,
          controversy_score: controversyScore,
          total_support_count: totalSupport,
          distinct_source_count: distinctSourceCount,
          dominant_claim_ratio: dominanceRatio,
          claim_count: memberIds.length,
          last_computed_at: new Date().toISOString(),
        })
        .eq("cluster_id", clusterId);

      await supabase.from("claim_cluster_members").delete().eq("cluster_id", clusterId);
    } else {
      const claimTextPromises = memberIds.slice(0, 10).map((cid) =>
        supabase.from("claims").select("canonical_text").eq("claim_id", cid).single()
      );
      const claimTextResults = await Promise.all(claimTextPromises);
      const labelTexts = claimTextResults
        .map((r) => ((r.data as { canonical_text?: string } | null)?.canonical_text ?? "").slice(0, 200))
        .filter(Boolean);
      let clusterLabel = "Competing claims";
      try {
        clusterLabel = await generateClusterLabel(OPENAI_API_KEY, MODEL, labelTexts);
      } catch (e) {
        console.error("[claim_cluster_nightly] Label gen:", e);
      }

      const { data: ins, error: insErr } = await supabase
        .from("claim_clusters")
        .insert({
          cluster_fingerprint: fingerprint,
          centroid_embedding: centroid ? embeddingToStr(centroid) : null,
          controversy_score: controversyScore,
          total_support_count: totalSupport,
          distinct_source_count: distinctSourceCount,
          dominant_claim_ratio: dominanceRatio,
          claim_count: memberIds.length,
          cluster_label: clusterLabel,
          cluster_label_computed_at: new Date().toISOString(),
          last_computed_at: new Date().toISOString(),
        })
        .select("cluster_id")
        .single();

      if (insErr) {
        console.error("[claim_cluster_nightly] Insert cluster:", insErr.message);
        continue;
      }
      clusterId = (ins as { cluster_id: string }).cluster_id;
    }

    keptClusterIds.push(clusterId);

    const membersWithSupport = memberIds
      .map((cid) => ({
        claim_id: cid,
        support_count: supportMap.get(cid)?.support_count ?? 0,
        distinct_source_count: supportMap.get(cid)?.distinct_source_count ?? 0,
      }))
      .sort((a, b) => {
        if (b.distinct_source_count !== a.distinct_source_count) return b.distinct_source_count - a.distinct_source_count;
        return b.support_count - a.support_count;
      });

    const { data: claimEmbs } = await supabase
      .from("claims")
      .select("claim_id, embedding")
      .in("claim_id", memberIds)
      .not("embedding", "is", null);
    const embByClaim = new Map<string, number[]>();
    for (const row of claimEmbs ?? []) {
      const e = parseEmbedding((row as { embedding: unknown }).embedding);
      if (e) embByClaim.set((row as { claim_id: string }).claim_id, e);
    }

    for (let i = 0; i < membersWithSupport.length; i++) {
      const m = membersWithSupport[i];
      const memEmb = embByClaim.get(m.claim_id);
      const membershipScore =
        centroid && memEmb ? cosineSimilarity(centroid, memEmb) : null;
      await supabase.from("claim_cluster_members").insert({
        cluster_id: clusterId,
        claim_id: m.claim_id,
        membership_score: membershipScore,
        support_count: m.support_count,
        distinct_source_count: m.distinct_source_count,
        rank: i + 1,
      });
    }
  }

  // Orphan cleanup
  const { data: allClusters } = await supabase.from("claim_clusters").select("cluster_id");
  const allIds = (allClusters ?? []).map((c) => (c as { cluster_id: string }).cluster_id);
  const toDelete = allIds.filter((id) => !keptClusterIds.includes(id));
  for (const cid of toDelete) {
    await supabase.from("claim_clusters").delete().eq("cluster_id", cid);
  }

  // Update cluster_computed_at for processed claims
  await supabase
    .from("claims")
    .update({ cluster_computed_at: new Date().toISOString() })
    .in("claim_id", [...processedClaimIds]);

  return json({
    ok: true,
    processed: processedClaimIds.size,
    clusters_upserted: keptClusterIds.length,
    orphans_deleted: toDelete.length,
    dry_run: false,
  });
});
