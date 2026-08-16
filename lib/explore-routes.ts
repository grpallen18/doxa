/** Consumer explore route helpers (controversy-first IA). */

import { HOME_PATH } from '@/lib/constants'

export function homePath() {
  return HOME_PATH
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

export function peoplePath(uid: string) {
  return `/people/${encodeURIComponent(uid)}`
}

export function eidosPath(uid: string) {
  return `/people/${encodeURIComponent(uid)}/eidos`
}

/** @deprecated Use peoplePath — consumer profiles are people, not "entities". */
export function entityPath(uid: string) {
  return peoplePath(uid)
}

/** Minimum linked controversies before a topic hub is listed for consumers. */
export const TOPIC_HUB_DENSITY_BAR = 1
