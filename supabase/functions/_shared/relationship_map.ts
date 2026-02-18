// Relationship mapping: canonical names (pipeline) <-> DB values (claim_relationships).
// DB keeps existing enum values; pipeline code uses canonical names for clarity.

export const RELATIONSHIP_MAP = {
  supporting: "supports_same_position",
  contradictory: "contradicts",
  competing_framing: "competing_framing",
  orthogonal: "orthogonal",
} as const;

export type CanonicalRelationship = keyof typeof RELATIONSHIP_MAP;
export type DbRelationship = (typeof RELATIONSHIP_MAP)[CanonicalRelationship];

export function toDb(canonical: CanonicalRelationship): DbRelationship {
  return RELATIONSHIP_MAP[canonical];
}

export function fromDb(dbValue: string): CanonicalRelationship {
  const entry = Object.entries(RELATIONSHIP_MAP).find(([, db]) => db === dbValue);
  return (entry ? entry[0] : "orthogonal") as CanonicalRelationship;
}

// DB values for direct use in queries
export const DB_SUPPORTING = RELATIONSHIP_MAP.supporting;
export const DB_CONTRADICTORY = RELATIONSHIP_MAP.contradictory;
export const DB_COMPETING_FRAMING = RELATIONSHIP_MAP.competing_framing;
export const DB_ORTHOGONAL = RELATIONSHIP_MAP.orthogonal;
