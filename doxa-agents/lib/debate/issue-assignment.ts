/**
 * Issue (topic bucket) identity for scoped Viewpoint/Controversy assembly.
 * Props link via (Proposition)-[:IN_ISSUE]->(Issue).
 */

/** Stable Issue uid for a shared-entity blocking key. */
export function issueUidForEntity(entityUid: string): string {
  const id = entityUid.trim();
  return `issue:ent:${id}`.slice(0, 180);
}

/** Stable Issue uid for embedding-knn pairs (no shared entity yet). */
export function issueUidForSimTopic(topicKey: string): string {
  return `issue:sim:${fnv1aHex(topicKey || "general")}`.slice(0, 180);
}

export function resolveIssueUid(input: {
  blockReason?: string | null;
  entityUid?: string | null;
  topicKey?: string | null;
}): string {
  // Prefer entity bucket whenever we know the entity (including legacy candidates
  // that stored entityUid without relying on blockReason).
  if (input.entityUid?.trim()) {
    return issueUidForEntity(input.entityUid);
  }
  if (input.blockReason === "shared_entity") {
    // Name-only topicKey from older rows — still better as sim hash than crashing.
    return issueUidForSimTopic(input.topicKey || "general");
  }
  return issueUidForSimTopic(input.topicKey || "general");
}

/** FNV-1a 32-bit hex — deterministic, no crypto dependency. */
export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
