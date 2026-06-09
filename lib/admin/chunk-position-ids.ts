import { createHash } from 'crypto'

export const CHUNK_POSITION_ID_PREFIX = 'kp_'

export function buildChunkPositionIdSeed(
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
  return `doxa:chunk-position:${storyId}:${chunkIndex}:${normalized}:${disambiguator}`
}

export function hashPositionIdSeed(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex')
  return `${CHUNK_POSITION_ID_PREFIX}${hex.slice(0, 16)}`
}

export function deterministicChunkPositionId(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): string {
  return hashPositionIdSeed(buildChunkPositionIdSeed(storyId, chunkIndex, rawText, disambiguator))
}

function isValidPositionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(CHUNK_POSITION_ID_PREFIX) &&
    value.length > CHUNK_POSITION_ID_PREFIX.length
  )
}

export function ensureStablePositionIds(
  positions: Array<Record<string, unknown>>,
  storyId: string,
  chunkIndex: number,
  options?: { refinementCycle?: number; backfill?: boolean }
): Array<Record<string, unknown>> {
  const usedIds = new Set<string>()
  const result: Array<Record<string, unknown>> = []

  for (let index = 0; index < positions.length; index++) {
    const position = { ...positions[index] }
    let positionId = isValidPositionId(position.position_id) ? String(position.position_id) : null

    if (positionId && usedIds.has(positionId)) positionId = null

    if (!positionId) {
      const rawText = String(position.raw_text ?? '').trim()
      const baseDisambiguator = options?.backfill
        ? `backfill:idx:${index}`
        : options?.refinementCycle != null
          ? `refine:${options.refinementCycle}:idx:${index}`
          : `extract:idx:${index}`

      let suffix = 0
      do {
        const disambiguator = suffix === 0 ? baseDisambiguator : `${baseDisambiguator}:dup:${suffix}`
        positionId = deterministicChunkPositionId(storyId, chunkIndex, rawText, disambiguator)
        suffix += 1
      } while (usedIds.has(positionId))
    }

    usedIds.add(positionId)
    result.push({ ...position, position_id: positionId })
  }

  return result
}

export function positionRowKey(position: { position_id?: string | null; index: number }): string {
  if (position.position_id?.trim()) return position.position_id.trim()
  return `idx:${position.index}`
}
