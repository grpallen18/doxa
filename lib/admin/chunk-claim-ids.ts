import { createHash } from 'crypto'

export const CHUNK_CLAIM_ID_PREFIX = 'cc_'

export function buildChunkClaimIdSeed(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): string {
  const normalized = rawText
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return `doxa:chunk-claim:${storyId}:${chunkIndex}:${normalized}:${disambiguator}`
}

export function hashClaimIdSeed(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex')
  return `${CHUNK_CLAIM_ID_PREFIX}${hex.slice(0, 16)}`
}

export function deterministicChunkClaimId(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): string {
  return hashClaimIdSeed(buildChunkClaimIdSeed(storyId, chunkIndex, rawText, disambiguator))
}

function isValidClaimId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(CHUNK_CLAIM_ID_PREFIX) &&
    value.length > CHUNK_CLAIM_ID_PREFIX.length
  )
}

export function ensureStableClaimIds(
  claims: Array<Record<string, unknown>>,
  storyId: string,
  chunkIndex: number,
  options?: { refinementCycle?: number; backfill?: boolean }
): Array<Record<string, unknown>> {
  const usedIds = new Set<string>()
  const result: Array<Record<string, unknown>> = []

  for (let index = 0; index < claims.length; index++) {
    const claim = { ...claims[index] }
    let claimId = isValidClaimId(claim.claim_id) ? String(claim.claim_id) : null

    if (claimId && usedIds.has(claimId)) claimId = null

    if (!claimId) {
      const rawText = String(claim.raw_text ?? '').trim()
      const baseDisambiguator = options?.backfill
        ? `backfill:idx:${index}`
        : options?.refinementCycle != null
          ? `refine:${options.refinementCycle}:idx:${index}`
          : `extract:idx:${index}`

      let suffix = 0
      do {
        const disambiguator = suffix === 0 ? baseDisambiguator : `${baseDisambiguator}:dup:${suffix}`
        claimId = deterministicChunkClaimId(storyId, chunkIndex, rawText, disambiguator)
        suffix += 1
      } while (usedIds.has(claimId))
    }

    usedIds.add(claimId)
    result.push({ ...claim, claim_id: claimId })
  }

  return result
}

export function claimRowKey(claim: { claim_id?: string | null; index: number }): string {
  if (claim.claim_id?.trim()) return claim.claim_id.trim()
  return `idx:${claim.index}`
}
