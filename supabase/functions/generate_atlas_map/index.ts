// Supabase Edge Function: generate_atlas_map.
// Thesis-centric map generation: UMAP on claim embeddings, deterministic layout.
// Invoked by pg_cron weekly. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean, max_theses?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";
import { UMAP } from "npm:umap-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIMILARITY_THRESHOLD = 0.65;
const MAX_THESES = 50;
const N_NEIGHBORS = 15;
const MIN_DIST = 0.1;
const SPREAD = 1.0;

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

// Seeded RNG for deterministic UMAP (mulberry32)
function createSeededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
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

function normalizeCoords(coords: number[][]): number[][] {
  if (coords.length === 0) return coords;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = 2 / Math.max(rangeX, rangeY);
  return coords.map(([x, y]) => [
    ((x - minX) / rangeX) * scale - 1,
    ((y - minY) / rangeY) * scale - 1,
  ]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
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
  const maxTheses = clampInt(body.max_theses, 1, 100, MAX_THESES);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Fetch theses with centroid and at least one claim
  const { data: thesesData, error: thesesErr } = await supabase
    .from("theses")
    .select("thesis_id, topic_id, thesis_text, label, centroid_embedding, claim_count")
    .not("centroid_embedding", "is", null)
    .gte("claim_count", 1)
    .limit(maxTheses);

  if (thesesErr) {
    console.error("[generate_atlas_map] Fetch theses error:", thesesErr.message);
    return json({ error: thesesErr.message }, 500);
  }

  const theses = (Array.isArray(thesesData) ? thesesData : []) as Array<{
    thesis_id: string;
    topic_id: string | null;
    thesis_text: string | null;
    label: string | null;
    centroid_embedding: unknown;
    claim_count: number;
  }>;

  let mapsCreated = 0;
  let nodesCreated = 0;
  let edgesCreated = 0;

  for (const thesis of theses) {
    // Get claims for this thesis
    const { data: tcData, error: tcErr } = await supabase
      .from("thesis_claims")
      .select("claim_id")
      .eq("thesis_id", thesis.thesis_id);

    if (tcErr || !tcData?.length) continue;

    const claimIds = tcData.map((r) => r.claim_id);

    const { data: claimsData, error: claimsErr } = await supabase
      .from("claims")
      .select("claim_id, canonical_text, embedding")
      .in("claim_id", claimIds)
      .not("embedding", "is", null);

    if (claimsErr || !claimsData?.length) continue;

    const claims = claimsData as Array<{ claim_id: string; canonical_text: string; embedding: unknown }>;
    const embeddings: number[][] = [];
    const validClaimIds: string[] = [];

    for (const c of claims) {
      const emb = parseEmbedding(c.embedding);
      if (emb && emb.length > 0) {
        embeddings.push(emb);
        validClaimIds.push(c.claim_id);
      }
    }

    if (embeddings.length < 2) continue; // UMAP needs at least nNeighbors+1 points

    // Deterministic seed from thesis_id + sorted claim_ids
    const seedStr = thesis.thesis_id + validClaimIds.sort().join("");
    const seed = hashString(seedStr);
    const random = createSeededRandom(seed);

    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(N_NEIGHBORS, embeddings.length - 1),
      minDist: MIN_DIST,
      spread: SPREAD,
      random,
    });

    let coords2d: number[][];
    try {
      coords2d = umap.fit(embeddings);
    } catch (e) {
      console.warn("[generate_atlas_map] UMAP fit failed for thesis", thesis.thesis_id, e);
      continue;
    }

    coords2d = normalizeCoords(coords2d);

    const mapName = (thesis.thesis_text || thesis.label || thesis.thesis_id).slice(0, 200);

    if (dryRun) {
      mapsCreated++;
      nodesCreated += 1 + validClaimIds.length;
      edgesCreated += validClaimIds.length; // thesis -> claim
      continue;
    }

    // Find or create viz_map for this thesis
    const { data: existingMap } = await supabase
      .from("viz_maps")
      .select("id")
      .eq("scope_type", "thesis")
      .eq("scope_id", thesis.thesis_id)
      .maybeSingle();

    let mapIdStr: string;
    if (existingMap?.id) {
      mapIdStr = existingMap.id;
      await supabase.from("viz_maps").update({ name: mapName, time_window_days: null }).eq("id", mapIdStr);
    } else {
      const { data: newMap, error: insertErr } = await supabase
        .from("viz_maps")
        .insert({
          name: mapName,
          scope_type: "thesis",
          scope_id: thesis.thesis_id,
          time_window_days: null,
        })
        .select("id")
        .single();
      if (insertErr || !newMap?.id) {
        console.error("[generate_atlas_map] Insert viz_map error:", insertErr?.message);
        continue;
      }
      mapIdStr = newMap.id;
    }

    // Delete existing nodes/edges for this map (idempotent regenerate)
    await supabase.from("viz_edges").delete().eq("map_id", mapIdStr);
    await supabase.from("viz_nodes").delete().eq("map_id", mapIdStr);

    // Thesis at centroid of claims
    const cx = coords2d.reduce((s, p) => s + p[0], 0) / coords2d.length;
    const cy = coords2d.reduce((s, p) => s + p[1], 0) / coords2d.length;
    const driftSeed = (seed % 1000) / 1000;

    await supabase.from("viz_nodes").insert({
      map_id: mapIdStr,
      entity_type: "thesis",
      entity_id: thesis.thesis_id,
      x: cx,
      y: cy,
      layer: 1,
      size: 1.5,
      drift_seed: driftSeed,
    });

    const nodeRows = validClaimIds.map((claimId, i) => ({
      map_id: mapIdStr,
      entity_type: "claim",
      entity_id: claimId,
      x: coords2d[i][0],
      y: coords2d[i][1],
      layer: 2,
      size: 1.0,
      drift_seed: driftSeed + (i * 0.001) % 0.01,
    }));

    await supabase.from("viz_nodes").insert(nodeRows);

    const edgeRows = validClaimIds.map((claimId) => ({
      map_id: mapIdStr,
      source_type: "thesis",
      source_id: thesis.thesis_id,
      target_type: "claim",
      target_id: claimId,
      edge_type: "explicit",
      weight: 1.0,
    }));

    // Add similarity edges between claims above threshold
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim >= SIMILARITY_THRESHOLD) {
          edgeRows.push({
            map_id: mapIdStr,
            source_type: "claim",
            source_id: validClaimIds[i],
            target_type: "claim",
            target_id: validClaimIds[j],
            edge_type: "similarity",
            weight: sim,
            similarity_score: sim,
          });
        }
      }
    }

    await supabase.from("viz_edges").insert(edgeRows);

    mapsCreated++;
    nodesCreated += 1 + validClaimIds.length;
    edgesCreated += edgeRows.length;
  }

  return json({
    ok: true,
    dry_run: dryRun,
    maps_created: mapsCreated,
    nodes_created: nodesCreated,
    edges_created: edgesCreated,
  });
});
