export type NeoEntitySuggestion = {
  uid: string
  name: string
  kindHint: string | null
  mentions: number
}

export const ENTITY_SEARCH_MIN_CHARS = 2
export const ENTITY_SEARCH_LIMIT = 20

export function parseEntityUid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const uid = raw.trim()
  if (!uid || uid.length > 200) return null
  return uid
}
