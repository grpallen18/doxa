export type PositionRelationshipKind =
  | "same_family"
  | "agree"
  | "oppose"
  | "qualify"
  | "broader"
  | "narrower"
  | "compatible"
  | "orthogonal"
  | "unrelated";

export type AgreementClusterRelationshipKind =
  | "opposed"
  | "competing"
  | "compatible"
  | "orthogonal"
  | "nested"
  | "partially_overlapping";

export const CORE_UNION_KINDS: PositionRelationshipKind[] = ["same_family", "agree"];

export const SOFT_ATTACH_KINDS: PositionRelationshipKind[] = ["qualify", "broader", "narrower"];

export const STRONG_CONTROVERSY_CLUSTER_KINDS: AgreementClusterRelationshipKind[] = ["opposed", "competing"];

export function isCoreUnion(kind: PositionRelationshipKind): boolean {
  return CORE_UNION_KINDS.includes(kind);
}

export function isSoftAttach(kind: PositionRelationshipKind): boolean {
  return SOFT_ATTACH_KINDS.includes(kind);
}

export function isStrongControversyEdge(kind: AgreementClusterRelationshipKind): boolean {
  return STRONG_CONTROVERSY_CLUSTER_KINDS.includes(kind);
}

export const VALID_POSITION_KINDS: PositionRelationshipKind[] = [
  "same_family",
  "agree",
  "oppose",
  "qualify",
  "broader",
  "narrower",
  "compatible",
  "orthogonal",
  "unrelated",
];

export const VALID_CLUSTER_KINDS: AgreementClusterRelationshipKind[] = [
  "opposed",
  "competing",
  "compatible",
  "orthogonal",
  "nested",
  "partially_overlapping",
];
