// Supabase Edge Function: generate_atlas_map.
// Viewpoint-centric map generation: builds graph (viz_maps, viz_nodes, viz_edges) from controversy_viewpoints + position_cluster_claims + claims.
// Layout is computed client-side via force-directed simulation.
// Invoked by pg_cron weekly. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { dry_run?: boolean, max_viewpoints?: number }.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SIMILARITY_THRESHOLD = 0.65;
const MAX_VIEWPOINTS = 50;

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
  const maxViewpoints = clampInt(body.max_viewpoints, 1, 100, MAX_VIEWPOINTS);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Orphan cleanup: delete thesis-scoped maps (legacy)
  const { data: thesisMaps } = await supabase
    .from("viz_maps")
    .select("id")
    .eq("scope_type", "thesis");

  let mapsDeleted = 0;
  if (thesisMaps && thesisMaps.length > 0) {
    const orphanIds = thesisMaps.map((m) => m.id);
    if (!dryRun) {
      const { error: deleteErr } = await supabase
        .from("viz_maps")
        .delete()
        .in("id", orphanIds);
      if (!deleteErr) mapsDeleted = orphanIds.length;
    } else {
      mapsDeleted = orphanIds.length;
    }
  }

  // Fetch controversy_viewpoints (each has position_cluster_id for claims)
  const { data: viewpointsData, error: vpErr } = await supabase
    .from("controversy_viewpoints")
    .select("viewpoint_id, position_cluster_id, title, summary")
    .limit(maxViewpoints);

  if (vpErr) {
    console.error("[generate_atlas_map] Fetch viewpoints error:", vpErr.message);
    return json({ error: vpErr.message }, 500);
  }

  const viewpoints = (viewpointsData ?? []) as Array<{
    viewpoint_id: string;
    position_cluster_id: string;
    title: string | null;
    summary: string | null;
  }>;

  let mapsCreated = 0;
  let nodesCreated = 0;
  let edgesCreated = 0;

  for (const vp of viewpoints) {
    const { data: pccData, error: pccErr } = await supabase
      .from("position_cluster_claims")
      .select("claim_id")
      .eq("position_cluster_id", vp.position_cluster_id);

    if (pccErr || !pccData?.length) continue;

    const claimIds = pccData.map((r) => r.claim_id);

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

    if (embeddings.length < 1) continue;

    const mapName = (vp.title || vp.summary || vp.viewpoint_id).slice(0, 200);

    if (dryRun) {
      mapsCreated++;
      nodesCreated += 1 + validClaimIds.length;
      edgesCreated += validClaimIds.length;
      continue;
    }

    const { data: existingMap } = await supabase
      .from("viz_maps")
      .select("id")
      .eq("scope_type", "viewpoint")
      .eq("scope_id", vp.viewpoint_id)
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
          scope_type: "viewpoint",
          scope_id: vp.viewpoint_id,
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

    await supabase.from("viz_edges").delete().eq("map_id", mapIdStr);
    await supabase.from("viz_nodes").delete().eq("map_id", mapIdStr);

    await supabase.from("viz_nodes").insert({
      map_id: mapIdStr,
      entity_type: "viewpoint",
      entity_id: vp.viewpoint_id,
      x: 0,
      y: 0,
      layer: 1,
      size: 1.5,
      drift_seed: 0,
    });

    const nodeRows = validClaimIds.map((claimId, i) => ({
      map_id: mapIdStr,
      entity_type: "claim",
      entity_id: claimId,
      x: 0,
      y: 0,
      layer: 2,
      size: 1.0,
      drift_seed: (i * 0.001) % 0.01,
    }));

    await supabase.from("viz_nodes").insert(nodeRows);

    const edgeRows = validClaimIds.map((claimId) => ({
      map_id: mapIdStr,
      source_type: "viewpoint",
      source_id: vp.viewpoint_id,
      target_type: "claim",
      target_id: claimId,
      edge_type: "explicit",
      weight: 1.0,
      similarity_score: 1.0,
    }));

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
    maps_deleted: mapsDeleted,
    maps_created: mapsCreated,
    nodes_created: nodesCreated,
    edges_created: edgesCreated,
  });
});
