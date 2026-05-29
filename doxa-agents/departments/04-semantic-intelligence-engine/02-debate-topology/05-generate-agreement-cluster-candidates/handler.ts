// Supabase Edge Function: generate_agreement_cluster_candidates.
// Deterministic cluster-pair candidate queue before LLM cluster relationship classification.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { max_clusters?: number, dry_run?: boolean, agreement_cluster_id?: string }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  cosineFromDistance,
  jaccard,
  orderedPair,
  overlapCount,
  parseEmbedding,
  scoreClusterPairSignals,
  type ClusterPairSignals,
} from "../../../../lib/topology/candidate-signals.ts";
import { capTopKPerAnchor, dedupePairKey } from "../../../../lib/topology/candidate-ranking.ts";
import { clampInt, corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MAX_CLUSTERS = 15;
const KNN_COUNT = 10;
const TOP_K_PER_CLUSTER = 20;
const MIN_SCORE = 0.2;

export const handler = async (req: Request) => {
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
    /* defaults */
  }

  const maxClusters = clampInt(body.max_clusters, 1, 50, DEFAULT_MAX_CLUSTERS);
  const dryRun = Boolean(body.dry_run ?? false);
  const filterClusterId = typeof body.agreement_cluster_id === "string" ? body.agreement_cluster_id : null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let clusterQuery = supabase
    .from("agreement_clusters")
    .select("agreement_cluster_id, topic_id, centroid_embedding, label, summary")
    .eq("status", "active")
    .not("centroid_embedding", "is", null)
    .order("created_at", { ascending: true })
    .limit(maxClusters);

  if (filterClusterId) {
    clusterQuery = clusterQuery.eq("agreement_cluster_id", filterClusterId);
  }

  const { data: clusters } = await clusterQuery;
  const clusterList = clusters ?? [];
  if (clusterList.length === 0) {
    return json({ ok: true, candidates_upserted: 0, message: "No active clusters with centroids" });
  }

  const clusterIds = clusterList.map((c) => c.agreement_cluster_id as string);

  const { data: acpRows } = await supabase
    .from("agreement_cluster_positions")
    .select("agreement_cluster_id, canonical_position_id")
    .in("agreement_cluster_id", clusterIds)
    .eq("membership_kind", "core");

  const positionsByCluster = new Map<string, string[]>();
  for (const r of acpRows ?? []) {
    const cid = r.agreement_cluster_id as string;
    if (!positionsByCluster.has(cid)) positionsByCluster.set(cid, []);
    positionsByCluster.get(cid)!.push(r.canonical_position_id as string);
  }

  const allPositionIds = [...new Set((acpRows ?? []).map((r) => r.canonical_position_id as string))];

  const { data: subtopicRows } = await supabase
    .from("position_subtopics")
    .select("canonical_position_id, subtopic_id")
    .in("canonical_position_id", allPositionIds)
    .in("rank", [1, 2, 3]);

  const subtopicsByCluster = new Map<string, Set<string>>();
  for (const cid of clusterIds) {
    subtopicsByCluster.set(cid, new Set());
    for (const pid of positionsByCluster.get(cid) ?? []) {
      for (const r of subtopicRows ?? []) {
        if (r.canonical_position_id === pid) {
          subtopicsByCluster.get(cid)!.add(r.subtopic_id as string);
        }
      }
    }
  }

  const { data: claimRows } = await supabase
    .from("agreement_cluster_claims")
    .select("agreement_cluster_id, claim_id")
    .in("agreement_cluster_id", clusterIds);

  const claimsByCluster = new Map<string, Set<string>>();
  for (const r of claimRows ?? []) {
    const cid = r.agreement_cluster_id as string;
    if (!claimsByCluster.has(cid)) claimsByCluster.set(cid, new Set());
    claimsByCluster.get(cid)!.add(r.claim_id as string);
  }

  const storiesByCluster = new Map<string, Set<string>>();
  const eventsByCluster = new Map<string, Set<string>>();

  if (allPositionIds.length > 0) {
    const { data: spRows } = await supabase
      .from("story_positions")
      .select("canonical_position_id, story_id")
      .in("canonical_position_id", allPositionIds);

    const storyByPos = new Map<string, Set<string>>();
    for (const r of spRows ?? []) {
      const pid = r.canonical_position_id as string;
      if (!storyByPos.has(pid)) storyByPos.set(pid, new Set());
      storyByPos.get(pid)!.add(r.story_id as string);
    }

    for (const cid of clusterIds) {
      storiesByCluster.set(cid, new Set());
      for (const pid of positionsByCluster.get(cid) ?? []) {
        for (const sid of storyByPos.get(pid) ?? []) {
          storiesByCluster.get(cid)!.add(sid);
        }
      }
    }

    const { data: evtRows } = await supabase
      .from("story_position_event_context")
      .select("canonical_position_id, event_id")
      .in("canonical_position_id", allPositionIds)
      .not("event_id", "is", null);

    const eventsByPos = new Map<string, Set<string>>();
    for (const r of evtRows ?? []) {
      const pid = r.canonical_position_id as string;
      const eid = r.event_id as string;
      if (!eventsByPos.has(pid)) eventsByPos.set(pid, new Set());
      eventsByPos.get(pid)!.add(eid);
    }

    for (const cid of clusterIds) {
      eventsByCluster.set(cid, new Set());
      for (const pid of positionsByCluster.get(cid) ?? []) {
        for (const eid of eventsByPos.get(pid) ?? []) {
          eventsByCluster.get(cid)!.add(eid);
        }
      }
    }
  }

  type CandidateRow = { a: string; b: string; score: number; signals: ClusterPairSignals };
  const rawCandidates: CandidateRow[] = [];
  const seen = new Set<string>();

  for (const cluster of clusterList) {
    const cid = cluster.agreement_cluster_id as string;
    const topicId = cluster.topic_id as string;
    const embStr = parseEmbedding(cluster.centroid_embedding);
    if (!embStr || !topicId) continue;

    const { data: knnRows } = await supabase.rpc("match_agreement_clusters_nearest_in_topic", {
      query_embedding: embStr,
      topic_id: topicId,
      match_count: KNN_COUNT + 1,
    });

    const neighbors = (knnRows ?? []) as Array<{ agreement_cluster_id: string; distance: number }>;
    const mySubs = subtopicsByCluster.get(cid) ?? new Set<string>();
    const myClaims = claimsByCluster.get(cid) ?? new Set<string>();
    const myStories = storiesByCluster.get(cid) ?? new Set<string>();
    const myEvents = eventsByCluster.get(cid) ?? new Set<string>();

    for (const nb of neighbors) {
      if (nb.agreement_cluster_id === cid) continue;

      const [a, b] = orderedPair(cid, nb.agreement_cluster_id);
      const key = dedupePairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);

      const nbSubs = subtopicsByCluster.get(nb.agreement_cluster_id) ?? new Set<string>();
      const subtopicOverlap = jaccard(mySubs, nbSubs);

      const signals: ClusterPairSignals = {
        subtopic_overlap: subtopicOverlap,
        centroid_sim: cosineFromDistance(nb.distance),
        claim_overlap_count: overlapCount(myClaims, claimsByCluster.get(nb.agreement_cluster_id) ?? new Set()),
        story_overlap_count: overlapCount(myStories, storiesByCluster.get(nb.agreement_cluster_id) ?? new Set()),
        event_overlap_count: overlapCount(myEvents, eventsByCluster.get(nb.agreement_cluster_id) ?? new Set()),
      };

      const score = scoreClusterPairSignals(signals);
      if (score < MIN_SCORE) continue;

      rawCandidates.push({ a, b, score, signals });
    }
  }

  const capped = capTopKPerAnchor(rawCandidates, (c) => c.a, (c) => c.score, TOP_K_PER_CLUSTER);

  if (dryRun) {
    return json({ ok: true, dry_run: true, candidates: capped.length, sample: capped.slice(0, 10) });
  }

  let upserted = 0;
  for (const c of capped) {
    const { error } = await supabase.from("agreement_cluster_pair_candidates").upsert(
      {
        agreement_cluster_a_id: c.a,
        agreement_cluster_b_id: c.b,
        score: c.score,
        signals: c.signals,
        status: "pending",
        ranked_at: new Date().toISOString(),
      },
      { onConflict: "agreement_cluster_a_id,agreement_cluster_b_id" }
    );
    if (!error) upserted += 1;
  }

  return json({ ok: true, clusters_processed: clusterList.length, candidates_upserted: upserted });
};
