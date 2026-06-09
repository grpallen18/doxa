import { normalizeText } from "./text-match.ts";

export const CHUNK_CLAIM_ID_PREFIX = "cc_";

export function buildChunkClaimIdSeed(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): string {
  return `doxa:chunk-claim:${storyId}:${chunkIndex}:${normalizeText(rawText)}:${disambiguator}`;
}

export async function hashClaimIdSeed(seed: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${CHUNK_CLAIM_ID_PREFIX}${hex.slice(0, 16)}`;
}

export async function deterministicChunkClaimId(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): Promise<string> {
  return hashClaimIdSeed(buildChunkClaimIdSeed(storyId, chunkIndex, rawText, disambiguator));
}

function isValidClaimId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(CHUNK_CLAIM_ID_PREFIX) && value.length > CHUNK_CLAIM_ID_PREFIX.length;
}

export async function ensureStableClaimIds(
  claims: Array<Record<string, unknown>>,
  storyId: string,
  chunkIndex: number,
  options?: { refinementCycle?: number }
): Promise<Array<Record<string, unknown>>> {
  const usedIds = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (let index = 0; index < claims.length; index++) {
    const claim = { ...claims[index] };
    let claimId = isValidClaimId(claim.claim_id) ? String(claim.claim_id) : null;

    if (claimId && usedIds.has(claimId)) claimId = null;

    if (!claimId) {
      const rawText = String(claim.raw_text ?? "").trim();
      const baseDisambiguator =
        options?.refinementCycle != null
          ? `refine:${options.refinementCycle}:idx:${index}`
          : `extract:idx:${index}`;

      let suffix = 0;
      do {
        const disambiguator = suffix === 0 ? baseDisambiguator : `${baseDisambiguator}:dup:${suffix}`;
        claimId = await deterministicChunkClaimId(storyId, chunkIndex, rawText, disambiguator);
        suffix += 1;
      } while (usedIds.has(claimId));
    }

    usedIds.add(claimId);
    result.push({ ...claim, claim_id: claimId });
  }

  return result;
}
