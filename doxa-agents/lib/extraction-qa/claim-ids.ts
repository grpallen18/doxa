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

function claimRawText(claim: Record<string, unknown>): string {
  return String(claim.raw_text ?? claim.claim_text ?? "").trim();
}

/**
 * Force refined claims to keep repair-queue identities. Never trust model claim_id swaps.
 * Output may drop claims (fewer than input). Extra invented claims are dropped, not kept.
 */
export function remapRefinedClaimIds(
  outputClaims: unknown[],
  inputClaims: Array<Record<string, unknown>>
): { claims: Array<Record<string, unknown>>; droppedExtras: number } {
  const inputs = inputClaims
    .map((claim) => {
      const claimId = typeof claim.claim_id === "string" ? claim.claim_id : null;
      if (!claimId) return null;
      return {
        claim_id: claimId,
        raw_text: claimRawText(claim),
        norm: normalizeText(claimRawText(claim)),
      };
    })
    .filter((row): row is { claim_id: string; raw_text: string; norm: string } => row != null);

  if (inputs.length === 0) {
    throw new Error("refiner_claim_id_remap_failed: repair_queue inputs missing claim_id");
  }

  const allowedIds = new Set(inputs.map((row) => row.claim_id));
  if (allowedIds.size !== inputs.length) {
    throw new Error("refiner_claim_id_remap_failed: duplicate claim_id in repair_queue inputs");
  }

  const outputs = (Array.isArray(outputClaims) ? outputClaims : [])
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({ ...row }));

  const unused = new Map(inputs.map((row) => [row.claim_id, row]));
  const assigned: Array<Record<string, unknown> | null> = outputs.map(() => null);

  for (let i = 0; i < outputs.length; i++) {
    const outNorm = normalizeText(claimRawText(outputs[i]));
    if (!outNorm) continue;
    const exact = [...unused.values()].filter((row) => row.norm === outNorm);
    if (exact.length === 1) {
      const match = exact[0];
      unused.delete(match.claim_id);
      assigned[i] = { ...outputs[i], claim_id: match.claim_id };
    }
  }

  for (let i = 0; i < outputs.length; i++) {
    if (assigned[i]) continue;
    const outNorm = normalizeText(claimRawText(outputs[i]));
    if (!outNorm) continue;
    const partial = [...unused.values()].filter(
      (row) => row.norm.includes(outNorm) || outNorm.includes(row.norm)
    );
    if (partial.length === 1) {
      const match = partial[0];
      unused.delete(match.claim_id);
      assigned[i] = { ...outputs[i], claim_id: match.claim_id };
    }
  }

  const remainingOutIndexes = assigned
    .map((row, index) => (row == null ? index : -1))
    .filter((index) => index >= 0);
  const remainingInputs = [...unused.values()];

  let droppedExtras = 0;
  if (remainingOutIndexes.length > 0) {
    const zipCount = Math.min(remainingOutIndexes.length, remainingInputs.length);
    for (let i = 0; i < zipCount; i++) {
      const outIndex = remainingOutIndexes[i];
      const match = remainingInputs[i];
      unused.delete(match.claim_id);
      assigned[outIndex] = { ...outputs[outIndex], claim_id: match.claim_id };
    }
    droppedExtras = remainingOutIndexes.length - zipCount;
    for (let i = zipCount; i < remainingOutIndexes.length; i++) {
      assigned[remainingOutIndexes[i]] = null;
    }
  }

  if (outputs.length > inputs.length) {
    droppedExtras = Math.max(droppedExtras, outputs.length - inputs.length);
  }

  const result = assigned
    .filter((row): row is Record<string, unknown> => row != null)
    .map((claim) => {
      const claimId = String(claim.claim_id);
      if (!allowedIds.has(claimId)) {
        throw new Error(`refiner_claim_id_remap_failed: unexpected claim_id ${claimId}`);
      }
      return claim;
    });

  if (result.length === 0) {
    throw new Error("refiner_claim_id_remap_failed: no repair claims could be mapped from model output");
  }

  const resultIds = result.map((row) => String(row.claim_id));
  if (new Set(resultIds).size !== resultIds.length) {
    throw new Error("refiner_claim_id_remap_failed: duplicate claim_id after remap");
  }

  return { claims: result, droppedExtras };
}

export function assertClaimIdsSubsetOf(
  claims: Array<Record<string, unknown>>,
  allowedClaimIds: Iterable<string>
): void {
  const allowed = new Set(allowedClaimIds);
  for (const claim of claims) {
    const claimId = typeof claim.claim_id === "string" ? claim.claim_id : null;
    if (!claimId || !allowed.has(claimId)) {
      throw new Error(
        `refiner_claim_id_drift: claim_id ${claimId ?? "<missing>"} is not in the repair_queue identity set`
      );
    }
  }
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
