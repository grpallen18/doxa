// Supabase Edge Function: generate_position_pair_candidates.
// Deterministic candidate queue with provenance signals before LLM classification.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Body: { max_positions?: number, dry_run?: boolean, canonical_position_id?: string }

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  cosineFromDistance,
  jaccard,
  normalizeCount,
  orderedPair,
  overlapCount,
  parseEmbedding,
  scorePositionPairSignals,
  type PositionPairSignals,
} from "../../../../lib/topology/candidate-signals.ts";
import { capTopKPerAnchor, dedupePairKey } from "../../../../lib/topology/candidate-ranking.ts";
import { clampInt, corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";

const DEFAULT_MAX_POSITIONS = 20;
const KNN_COUNT = 15;
const TOP_K_PER_POSITION = 30;
const MIN_SCORE = 0.15;

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

  const maxPositions = clampInt(body.max_positions, 1, 50, DEFAULT_MAX_POSITIONS);
  const dryRun = Boolean(body.dry_run ?? false);
  const filterPositionId = typeof body.canonical_position_id === "string" ? body.canonical_position_id : null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let posQuery = supabase
    .from("canonical_positions")
    .select("canonical_position_id, embedding, primary_topic_id")
    .not("embedding", "is", null)
    .not("primary_topic_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(maxPositions);

  if (filterPositionId) {
    posQuery = posQuery.eq("canonical_position_id", filterPositionId);
  }

  const { data: positions } = await posQuery;
  const posList = positions ?? [];
  if (posList.length === 0) {
    return json({ ok: true, candidates_upserted: 0, message: "No positions" });
  }

  const positionIds = posList.map((p) => p.canonical_position_id as string);

  const { data: subtopicRows } = await supabase
    .from("position_subtopics")
    .select("canonical_position_id, subtopic_id")
    .in("canonical_position_id", positionIds)
    .in("rank", [1, 2, 3]);

  const subtopicsByPos = new Map<string, Set<string>>();
  for (const r of subtopicRows ?? []) {
    const pid = r.canonical_position_id as string;
    const sid = r.subtopic_id as string;
    if (!subtopicsByPos.has(pid)) subtopicsByPos.set(pid, new Set());
    subtopicsByPos.get(pid)!.add(sid);
  }

  const { data: spRows } = await supabase
    .from("story_positions")
    .select("canonical_position_id, story_id, stories(source_id)")
    .in("canonical_position_id", positionIds)
    .not("canonical_position_id", "is", null);

  const storiesByPos = new Map<string, Set<string>>();
  const sourcesByPos = new Map<string, Set<string>>();
  for (const r of spRows ?? []) {
    const pid = r.canonical_position_id as string;
    const storyId = r.story_id as string;
    if (!storiesByPos.has(pid)) storiesByPos.set(pid, new Set());
    storiesByPos.get(pid)!.add(storyId);
    const src = (r.stories as { source_id?: string } | null)?.source_id;
    if (src) {
      if (!sourcesByPos.has(pid)) sourcesByPos.set(pid, new Set());
      sourcesByPos.get(pid)!.add(src);
    }
  }

  const { data: claimLinkRows } = await supabase
    .from("story_positions")
    .select("canonical_position_id, story_position_claim_links(story_claims(claim_id))")
    .in("canonical_position_id", positionIds);

  const claimsByPos = new Map<string, Set<string>>();
  for (const r of claimLinkRows ?? []) {
    const pid = r.canonical_position_id as string;
    const links = r.story_position_claim_links as Array<{ story_claims?: { claim_id?: string } | null }> | null;
    if (!claimsByPos.has(pid)) claimsByPos.set(pid, new Set());
    for (const link of links ?? []) {
      const cid = link.story_claims?.claim_id;
      if (cid) claimsByPos.get(pid)!.add(cid);
    }
  }

  type CandidateRow = {
    a: string;
    b: string;
    score: number;
    signals: PositionPairSignals;
  };

  const rawCandidates: CandidateRow[] = [];
  const seen = new Set<string>();

  for (const pos of posList) {
    const posId = pos.canonical_position_id as string;
    const embStr = parseEmbedding(pos.embedding);
    const topicId = pos.primary_topic_id as string;
    if (!embStr || !topicId) continue;

    const mySubs = subtopicsByPos.get(posId) ?? new Set<string>();
    const myStories = storiesByPos.get(posId) ?? new Set<string>();
    const mySources = sourcesByPos.get(posId) ?? new Set<string>();
    const myClaims = claimsByPos.get(posId) ?? new Set<string>();

    const { data: knnRows } = await supabase.rpc("match_positions_nearest_in_topic", {
      query_embedding: embStr,
      topic_id: topicId,
      match_count: KNN_COUNT + 1,
    });

    const neighbors = (knnRows ?? []) as Array<{ canonical_position_id: string; distance: number }>;
    for (const nb of neighbors) {
      if (nb.canonical_position_id === posId) continue;

      const nbSubs = subtopicsByPos.get(nb.canonical_position_id) ?? new Set<string>();
      const subtopicOverlap = jaccard(mySubs, nbSubs);
      if (subtopicOverlap <= 0 && cosineFromDistance(nb.distance) < 0.7) continue;

      const [a, b] = orderedPair(posId, nb.canonical_position_id);
      const key = dedupePairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);

      const nbStories = storiesByPos.get(nb.canonical_position_id) ?? new Set<string>();
      const nbSources = sourcesByPos.get(nb.canonical_position_id) ?? new Set<string>();
      const nbClaims = claimsByPos.get(nb.canonical_position_id) ?? new Set<string>();

      const signals: PositionPairSignals = {
        subtopic_overlap: subtopicOverlap,
        embedding_sim: cosineFromDistance(nb.distance),
        claim_overlap_count: overlapCount(myClaims, nbClaims),
        story_overlap_count: overlapCount(myStories, nbStories),
        source_overlap_count: overlapCount(mySources, nbSources),
      };

      const score = scorePositionPairSignals(signals);
      if (score < MIN_SCORE) continue;

      rawCandidates.push({ a, b, score, signals });
    }
  }

  const capped = capTopKPerAnchor(
    rawCandidates,
    (c) => c.a,
    (c) => c.score,
    TOP_K_PER_POSITION
  );

  if (dryRun) {
    return json({ ok: true, dry_run: true, candidates: capped.length, sample: capped.slice(0, 10) });
  }

  let upserted = 0;
  for (const c of capped) {
    const { error } = await supabase.from("position_pair_candidates").upsert(
      {
        position_a_id: c.a,
        position_b_id: c.b,
        score: c.score,
        signals: c.signals,
        status: "pending",
        ranked_at: new Date().toISOString(),
      },
      { onConflict: "position_a_id,position_b_id" }
    );
    if (!error) upserted += 1;
  }

  return json({ ok: true, positions_processed: posList.length, candidates_upserted: upserted });
};
