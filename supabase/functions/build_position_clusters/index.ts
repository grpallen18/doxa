// Supabase Edge Function: build_position_clusters.
// Builds position clusters from supporting claim edges. Enforced MIN/MAX size with splitting.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Invoke: POST with Authorization Bearer SERVICE_ROLE_KEY. Body: { dry_run?: boolean }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { DB_SUPPORTING } from "../_shared/relationship_map.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_POSITION_SIZE = 2;
const MAX_POSITION_SIZE = 30;

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

  // 1. Fetch supporting edges
  const { data: relRows, error: relErr } = await supabase
    .from("claim_relationships")
    .select("claim_a_id, claim_b_id")
    .eq("relationship", DB_SUPPORTING);

  if (relErr) {
    console.error("[build_position_clusters] claim_relationships:", relErr.message);
    return json({ error: relErr.message }, 500);
  }

  const uf = new UnionFind();
  for (const r of relRows ?? []) {
    const a = (r as { claim_a_id: string }).claim_a_id;
    const b = (r as { claim_b_id: string }).claim_b_id;
    uf.union(a, b);
  }

  const components = uf.getComponents();

  // 2. Filter by MIN, split by MAX
  const clusters: string[][] = [];
  for (const [, members] of components) {
    const unique = [...new Set(members)];
    if (unique.length < MIN_POSITION_SIZE) continue;
    if (unique.length <= MAX_POSITION_SIZE) {
      clusters.push(unique);
    } else {
      // Split by centroid similarity: iteratively take top MAX by sim to centroid
      let remaining = [...unique];
      while (remaining.length >= MIN_POSITION_SIZE) {
        const { data: embRows } = await supabase
          .from("claims")
          .select("claim_id, embedding")
          .in("claim_id", remaining)
          .not("embedding", "is", null);
        const embeddings = (embRows ?? [])
          .map((r) => ({
            claim_id: (r as { claim_id: string }).claim_id,
            emb: parseEmbedding((r as { embedding: unknown }).embedding),
          }))
          .filter((x): x is { claim_id: string; emb: number[] } => x.emb !== null && x.emb.length > 0);
        if (embeddings.length < MIN_POSITION_SIZE) break;
        const dim = embeddings[0].emb.length;
        const centroid = new Array(dim).fill(0);
        for (const e of embeddings) {
          for (let i = 0; i < dim; i++) centroid[i] += e.emb[i];
        }
        const mag = Math.sqrt(centroid.reduce((s, x) => s + x * x, 0));
        if (mag > 0) for (let i = 0; i < dim; i++) centroid[i] /= mag;
        const withSim = embeddings
          .map((e) => ({ claim_id: e.claim_id, sim: cosineSimilarity(e.emb, centroid) }))
          .sort((a, b) => b.sim - a.sim);
        const take = Math.min(MAX_POSITION_SIZE, withSim.length);
        const chunk = withSim.slice(0, take).map((x) => x.claim_id);
        clusters.push(chunk);
        const taken = new Set(chunk);
        remaining = remaining.filter((c) => !taken.has(c));
      }
    }
  }

  if (dryRun) {
    return json({ ok: true, position_clusters: clusters.length, dry_run: true });
  }

  // 3. Clear and insert (delete in order: controversies first, then pair_scores, then positions)
  const { data: existingControversies } = await supabase.from("controversy_clusters").select("controversy_cluster_id");
  const cIds = (existingControversies ?? []).map((r) => (r as { controversy_cluster_id: string }).controversy_cluster_id);
  if (cIds.length > 0) {
    await supabase.from("controversy_clusters").delete().in("controversy_cluster_id", cIds);
  }
  const { data: existingPairs } = await supabase.from("position_pair_scores").select("position_a_id");
  const pairAIds = [...new Set((existingPairs ?? []).map((r) => (r as { position_a_id: string }).position_a_id))];
  if (pairAIds.length > 0) {
    await supabase.from("position_pair_scores").delete().in("position_a_id", pairAIds);
  }
  const { data: existingPositions } = await supabase.from("position_clusters").select("position_cluster_id");
  const existingIds = (existingPositions ?? []).map((r) => (r as { position_cluster_id: string }).position_cluster_id);
  if (existingIds.length > 0) {
    await supabase.from("position_clusters").delete().in("position_cluster_id", existingIds);
  }

  for (const memberIds of clusters) {
    const { data: ins, error: insErr } = await supabase
      .from("position_clusters")
      .insert({})
      .select("position_cluster_id")
      .single();
    if (insErr) {
      console.error("[build_position_clusters] insert position_cluster:", insErr.message);
      continue;
    }
    const pid = (ins as { position_cluster_id: string }).position_cluster_id;
    const rows = memberIds.map((claim_id, i) => ({
      position_cluster_id: pid,
      claim_id,
      role: i < Math.min(5, memberIds.length) ? "core" : "supporting",
    }));
    await supabase.from("position_cluster_claims").insert(rows);
  }

  return json({ ok: true, position_clusters: clusters.length });
});
