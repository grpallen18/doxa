export type PositionPairSignals = {
  subtopic_overlap: number;
  embedding_sim: number;
  claim_overlap_count: number;
  story_overlap_count: number;
  source_overlap_count: number;
};

export type ClusterPairSignals = {
  subtopic_overlap: number;
  centroid_sim: number;
  claim_overlap_count: number;
  story_overlap_count: number;
  event_overlap_count: number;
};

export const POSITION_SIGNAL_WEIGHTS: Record<keyof PositionPairSignals, number> = {
  subtopic_overlap: 0.25,
  embedding_sim: 0.3,
  claim_overlap_count: 0.2,
  story_overlap_count: 0.15,
  source_overlap_count: 0.1,
};

export const CLUSTER_SIGNAL_WEIGHTS: Record<keyof ClusterPairSignals, number> = {
  subtopic_overlap: 0.2,
  centroid_sim: 0.3,
  claim_overlap_count: 0.2,
  story_overlap_count: 0.15,
  event_overlap_count: 0.15,
};

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function cosineFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
}

export function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    if (b.has(x)) n += 1;
  }
  return n;
}

export function normalizeCount(count: number, cap = 5): number {
  return Math.min(1, count / cap);
}

export function scorePositionPairSignals(signals: PositionPairSignals): number {
  let score = 0;
  score += POSITION_SIGNAL_WEIGHTS.subtopic_overlap * signals.subtopic_overlap;
  score += POSITION_SIGNAL_WEIGHTS.embedding_sim * signals.embedding_sim;
  score += POSITION_SIGNAL_WEIGHTS.claim_overlap_count * normalizeCount(signals.claim_overlap_count);
  score += POSITION_SIGNAL_WEIGHTS.story_overlap_count * normalizeCount(signals.story_overlap_count);
  score += POSITION_SIGNAL_WEIGHTS.source_overlap_count * normalizeCount(signals.source_overlap_count);
  return score;
}

export function scoreClusterPairSignals(signals: ClusterPairSignals): number {
  let score = 0;
  score += CLUSTER_SIGNAL_WEIGHTS.subtopic_overlap * signals.subtopic_overlap;
  score += CLUSTER_SIGNAL_WEIGHTS.centroid_sim * signals.centroid_sim;
  score += CLUSTER_SIGNAL_WEIGHTS.claim_overlap_count * normalizeCount(signals.claim_overlap_count);
  score += CLUSTER_SIGNAL_WEIGHTS.story_overlap_count * normalizeCount(signals.story_overlap_count);
  score += CLUSTER_SIGNAL_WEIGHTS.event_overlap_count * normalizeCount(signals.event_overlap_count);
  return score;
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function parseEmbedding(v: unknown): string | null {
  if (Array.isArray(v)) return `[${(v as number[]).join(",")}]`;
  if (typeof v === "string" && v.startsWith("[")) return v;
  return null;
}
