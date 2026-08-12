/** Consumer explore route helpers (controversy-first IA). */

export function homePath() {
  return '/'
}

export function searchPath(q?: string) {
  if (!q?.trim()) return '/search'
  return `/search?q=${encodeURIComponent(q.trim())}`
}

export function controversyPath(uid: string, topicSlug?: string | null) {
  if (topicSlug) return `/topics/${topicSlug}/c/${encodeURIComponent(uid)}`
  return `/c/${encodeURIComponent(uid)}`
}

export function topicHubPath(slug: string) {
  return `/topics/${slug}`
}

export function entityPath(uid: string) {
  return `/entities/${encodeURIComponent(uid)}`
}

/** Minimum linked controversies before a topic hub is listed for consumers. */
export const TOPIC_HUB_DENSITY_BAR = 1
