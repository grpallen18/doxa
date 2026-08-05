/** Hard ceiling for how many stories the union graph may include. */
export const UNION_MAX_STORIES = 100
/** Default story cap when the client does not specify one. */
export const UNION_DEFAULT_STORIES = 20

/** Clamp a client-supplied story cap into `[1, UNION_MAX_STORIES]`. */
export function clampUnionStoryLimit(raw: unknown): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw, 10)
        : Number.NaN
  if (!Number.isFinite(n) || n < 1) return UNION_DEFAULT_STORIES
  return Math.min(UNION_MAX_STORIES, Math.floor(n))
}
