/**
 * Arena identity for scoped Viewpoint/Controversy assembly.
 *
 * Neo4j label remains `Issue` (Aura constraint `issue_uid`). Docs and uids use
 * **Arena**: a size-bounded semantic community — not an entity mega-bucket.
 * Props link via (Proposition)-[:IN_ISSUE]->(Issue).
 *
 * Entity uids are a pair-candidate **blocking** signal only. They must never
 * become the Arena uid (`issue:ent:{entityUid}` is legacy).
 */

export const ARENA_UID_PREFIX = "arena:";
/** Namespace of every pre-Arena Issue uid (`issue:ent:`, `issue:sim:`). */
export const LEGACY_ISSUE_PREFIX = "issue:";
export const LEGACY_ENTITY_ISSUE_PREFIX = `${LEGACY_ISSUE_PREFIX}ent:`;
export const LEGACY_SIM_ISSUE_PREFIX = `${LEGACY_ISSUE_PREFIX}sim:`;

/** Max propositions per Arena before pairwise merge is refused. */
export const MAX_ARENA_PROPS = 48;

/** Max viewpoints in one Controversy component before mega-merge split. */
export const MAX_CONTROVERSY_SIDES = 8;

/** Max propositions in one Viewpoint component before split. */
export const MAX_VIEWPOINT_PROPS = 24;

/** Days between evidence peaks that fork a time chapter. */
export const CHAPTER_GAP_DAYS = 90;

export const ARENA_SCHEMA_VERSION = "2.4.0";

export function isLegacyIssueUid(uid: string): boolean {
  return (
    uid.startsWith(LEGACY_ENTITY_ISSUE_PREFIX) ||
    uid.startsWith(LEGACY_SIM_ISSUE_PREFIX)
  );
}

export function isArenaUid(uid: string): boolean {
  return uid.startsWith(ARENA_UID_PREFIX);
}

/** Deterministic Arena uid from an opaque seed (pair key, topicKey, …). */
export function arenaUidFromSeed(seed: string): string {
  return `${ARENA_UID_PREFIX}${fnv1aHex(seed || "general")}`.slice(0, 180);
}

/** Bootstrap Arena uid for a proposition pair (merged later if they connect). */
export function arenaUidForPair(a: string, b: string): string {
  const [left, right] = a < b ? [a, b] : [b, a];
  return arenaUidFromSeed(`${left}|${right}`);
}

/**
 * Resolve an Arena uid. Never uses entityUid as identity.
 * Prefer an already-assigned `arena:` uid, else hash the pair, else topicKey.
 */
export function resolveArenaUid(input: {
  a?: string | null;
  b?: string | null;
  storedIssueUid?: string | null;
  topicKey?: string | null;
}): string {
  const stored = input.storedIssueUid?.trim();
  if (stored && isArenaUid(stored)) return stored;
  if (input.a?.trim() && input.b?.trim()) {
    return arenaUidForPair(input.a, input.b);
  }
  return arenaUidFromSeed(input.topicKey || "general");
}

/** @deprecated Use resolveArenaUid — entity buckets are not assembly identity. */
export function resolveIssueUid(input: {
  blockReason?: string | null;
  entityUid?: string | null;
  topicKey?: string | null;
  a?: string | null;
  b?: string | null;
  storedIssueUid?: string | null;
}): string {
  return resolveArenaUid({
    a: input.a,
    b: input.b,
    storedIssueUid: input.storedIssueUid,
    topicKey: input.topicKey,
  });
}

/** Display label only — never an identity key. */
export function displayTopicKey(input: {
  entityName?: string | null;
  topicKey?: string | null;
}): string {
  const name = input.entityName?.trim();
  if (name) return name;
  const tk = (input.topicKey || "").trim();
  if (tk) return tk.replace(/^sim:/, "related claims on ");
  return "this issue";
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
