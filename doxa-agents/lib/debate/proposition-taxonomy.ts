/**
 * Proposition relationship taxonomy for Neo4j debate layer (Phase 2).
 * Ported from topology/relationship-taxonomy.ts — re-grounded on Proposition uids.
 */

export type PropositionRelationshipKind =
  | "agree"
  | "oppose"
  | "qualify"
  | "broader"
  | "narrower"
  | "compatible"
  | "orthogonal"
  | "unrelated"
  | "definitional_conflict"
  | "talking_past"
  | "assumption_conflict";

export const VALID_PROPOSITION_KINDS: PropositionRelationshipKind[] = [
  "agree",
  "oppose",
  "qualify",
  "broader",
  "narrower",
  "compatible",
  "orthogonal",
  "unrelated",
  "definitional_conflict",
  "talking_past",
  "assumption_conflict",
];

export const CORE_VIEWPOINT_UNION: PropositionRelationshipKind[] = ["agree"];

export const SOFT_VIEWPOINT_ATTACH: PropositionRelationshipKind[] = [
  "qualify",
  "broader",
  "narrower",
];

export const STRONG_CONTROVERSY_KINDS: PropositionRelationshipKind[] = ["oppose"];

export const DISPUTE_KINDS: PropositionRelationshipKind[] = [
  "definitional_conflict",
  "talking_past",
  "assumption_conflict",
];

/** Auto-accept band for high-precision classify; else quarantine Decision. */
export const AUTO_ACCEPT_MIN_CONFIDENCE = 0.85;

export function isCoreViewpointUnion(kind: PropositionRelationshipKind): boolean {
  return CORE_VIEWPOINT_UNION.includes(kind);
}

export function isStrongControversyEdge(kind: PropositionRelationshipKind): boolean {
  return STRONG_CONTROVERSY_KINDS.includes(kind);
}

export function isDisputeKind(kind: PropositionRelationshipKind): boolean {
  return DISPUTE_KINDS.includes(kind);
}

export function parsePropositionKind(raw: unknown): PropositionRelationshipKind | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim().toLowerCase() as PropositionRelationshipKind;
  return VALID_PROPOSITION_KINDS.includes(k) ? k : null;
}
