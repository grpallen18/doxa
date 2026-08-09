/**
 * Stable opaque L3 identity: match rebuilt components to existing nodes by
 * Jaccard overlap on member ids (propositions for Viewpoints; proposition
 * closure for Controversies). Threshold 0.5 per scalable controversy plan.
 */

export const STABLE_IDENTITY_JACCARD = 0.5;

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function newStableUid(prefix: "vp" | "ctr"): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${id}`;
}

export type StableMemberComponent = {
  memberIds: string[];
  /** Optional secondary set used for matching (e.g. prop closure for controversies). */
  matchIds?: string[];
  topicKey: string;
  edgeDecisionUids?: string[];
};

export type StableAssigned<T extends StableMemberComponent> = T & {
  uid: string;
  reused: boolean;
};

/**
 * Greedy 1:1 assignment of new components to existing uids by Jaccard on
 * matchIds (fallback memberIds). Unmatched components get fresh opaque uids.
 */
export function assignStableUids<T extends StableMemberComponent>(
  components: T[],
  existing: Array<{ uid: string; memberIds: string[] }>,
  prefix: "vp" | "ctr",
  threshold = STABLE_IDENTITY_JACCARD
): Array<StableAssigned<T>> {
  type Score = { ci: number; uid: string; score: number };
  const scored: Score[] = [];
  for (let ci = 0; ci < components.length; ci++) {
    const ids = components[ci].matchIds ?? components[ci].memberIds;
    for (const ex of existing) {
      const score = jaccard(ids, ex.memberIds);
      if (score >= threshold) scored.push({ ci, uid: ex.uid, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const assigned = new Map<number, string>();
  const usedExisting = new Set<string>();
  for (const s of scored) {
    if (assigned.has(s.ci) || usedExisting.has(s.uid)) continue;
    assigned.set(s.ci, s.uid);
    usedExisting.add(s.uid);
  }
  return components.map((c, i) => {
    const reusedUid = assigned.get(i);
    if (reusedUid) {
      return { ...c, uid: reusedUid, reused: true };
    }
    return { ...c, uid: newStableUid(prefix), reused: false };
  });
}
