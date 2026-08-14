/** Hard ceiling for how many stories the union graph may include. */
export const UNION_MAX_STORIES = 250
/** Default story cap when the client does not specify one. */
export const UNION_DEFAULT_STORIES = 20
/** Default story cap for the Neo union graph UI / Apply depth (desktop). */
export const UNION_GRAPH_DEFAULT_STORIES = 250
/** First-load cap on coarse pointers (phones / tablets). */
export const UNION_GRAPH_PHONE_STORIES = 50
/** @deprecated Use UNION_GRAPH_DEFAULT_STORIES */
export const UNION_V2_DEFAULT_STORIES = UNION_GRAPH_DEFAULT_STORIES

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

/** Desktop opens at max; phones open smaller. Safe to call on the server (desktop default). */
export function unionGraphDefaultStories(): number {
  if (typeof window === 'undefined') return UNION_GRAPH_DEFAULT_STORIES
  try {
    if (window.matchMedia('(pointer: coarse)').matches) {
      return UNION_GRAPH_PHONE_STORIES
    }
  } catch {
    /* matchMedia unavailable */
  }
  return UNION_GRAPH_DEFAULT_STORIES
}
