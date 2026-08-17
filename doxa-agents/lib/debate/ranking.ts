/**
 * Consumer ranking / relevance decay for projected controversies.
 */

const HALF_LIFE_DAYS = 45;

export function rankingScore(input: {
  sidesCount: number;
  sourceCount: number;
  updatedAt: Date | string | null;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const updated =
    input.updatedAt instanceof Date
      ? input.updatedAt
      : input.updatedAt
        ? new Date(input.updatedAt)
        : now;
  const ageMs = Math.max(0, now.getTime() - updated.getTime());
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = Math.exp(-ageDays / HALF_LIFE_DAYS);
  const sides = Math.max(1, Number(input.sidesCount) || 1);
  const sources = Math.max(0, Number(input.sourceCount) || 0);
  return sides * Math.log(1 + sources) * decay;
}
