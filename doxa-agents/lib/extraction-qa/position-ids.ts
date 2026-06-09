import { normalizeText } from "./text-match.ts";

export const CHUNK_POSITION_ID_PREFIX = "kp_";

export function buildChunkPositionIdSeed(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): string {
  return `doxa:chunk-position:${storyId}:${chunkIndex}:${normalizeText(rawText)}:${disambiguator}`;
}

export async function hashPositionIdSeed(seed: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${CHUNK_POSITION_ID_PREFIX}${hex.slice(0, 16)}`;
}

export async function deterministicChunkPositionId(
  storyId: string,
  chunkIndex: number,
  rawText: string,
  disambiguator: string
): Promise<string> {
  return hashPositionIdSeed(buildChunkPositionIdSeed(storyId, chunkIndex, rawText, disambiguator));
}

function isValidPositionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(CHUNK_POSITION_ID_PREFIX) &&
    value.length > CHUNK_POSITION_ID_PREFIX.length
  );
}

export async function ensureStablePositionIds(
  positions: Array<Record<string, unknown>>,
  storyId: string,
  chunkIndex: number,
  options?: { refinementCycle?: number }
): Promise<Array<Record<string, unknown>>> {
  const usedIds = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (let index = 0; index < positions.length; index++) {
    const position = { ...positions[index] };
    let positionId = isValidPositionId(position.position_id) ? String(position.position_id) : null;

    if (positionId && usedIds.has(positionId)) positionId = null;

    if (!positionId) {
      const rawText = String(position.raw_text ?? "").trim();
      const baseDisambiguator =
        options?.refinementCycle != null
          ? `refine:${options.refinementCycle}:idx:${index}`
          : `extract:idx:${index}`;

      let suffix = 0;
      do {
        const disambiguator = suffix === 0 ? baseDisambiguator : `${baseDisambiguator}:dup:${suffix}`;
        positionId = await deterministicChunkPositionId(storyId, chunkIndex, rawText, disambiguator);
        suffix += 1;
      } while (usedIds.has(positionId));
    }

    usedIds.add(positionId);
    result.push({ ...position, position_id: positionId });
  }

  return result;
}
