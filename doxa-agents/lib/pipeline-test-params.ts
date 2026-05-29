/** Optional isolation params for manual / integration testing of pipeline steps. */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type IdParseResult = {
  id: string | null;
  invalid: boolean;
};

function parseUuidField(body: Record<string, unknown>, ...keys: string[]): IdParseResult {
  let raw: unknown;
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) {
      raw = body[key];
      break;
    }
  }
  if (raw === undefined) return { id: null, invalid: false };
  if (typeof raw !== "string") return { id: null, invalid: true };
  const id = raw.trim();
  if (!id) return { id: null, invalid: false };
  return UUID_RE.test(id) ? { id, invalid: false } : { id: null, invalid: true };
}

export function parseStoryIdFromBody(body: Record<string, unknown>): IdParseResult {
  return parseUuidField(body, "story_id", "storyId");
}

export function parseClaimIdFromBody(body: Record<string, unknown>): IdParseResult {
  return parseUuidField(body, "claim_id", "story_claim_id", "storyClaimId");
}

export function parsePositionIdFromBody(body: Record<string, unknown>): IdParseResult {
  return parseUuidField(body, "position_id", "story_position_id", "storyPositionId");
}

export function parseCanonicalClaimIdFromBody(body: Record<string, unknown>): IdParseResult {
  return parseUuidField(body, "canonical_claim_id", "claim_id");
}

export function parseCanonicalPositionIdFromBody(body: Record<string, unknown>): IdParseResult {
  return parseUuidField(body, "canonical_position_id", "position_id");
}

export function invalidUuidMessage(field: string): string {
  return `Invalid ${field}; expected a UUID`;
}

export function testScopeFields(scope: {
  storyId?: string | null;
  claimId?: string | null;
  positionId?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (scope.storyId) {
    out.single_story = true;
    out.story_id = scope.storyId;
  }
  if (scope.claimId) {
    out.single_claim = true;
    out.story_claim_id = scope.claimId;
  }
  if (scope.positionId) {
    out.single_position = true;
    out.story_position_id = scope.positionId;
  }
  return out;
}
