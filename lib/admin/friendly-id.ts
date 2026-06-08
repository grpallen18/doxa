/** Crockford Base32 body after the type prefix and hyphen (e.g. S-7K3M9P2X). */
export const STORY_FRIENDLY_ID_BODY_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/

export const STORY_FRIENDLY_ID_RE = /^S-[0-9A-HJKMNP-TV-Z]{8}$/i

export const CHUNK_FRIENDLY_ID_RE = /^K-[0-9A-HJKMNP-TV-Z]{8}$/i

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function isStoryFriendlyId(value: string): boolean {
  return STORY_FRIENDLY_ID_RE.test(value.trim())
}

export function normalizeStoryFriendlyId(value: string): string {
  return value.trim().toUpperCase()
}

export function isChunkFriendlyId(value: string): boolean {
  return CHUNK_FRIENDLY_ID_RE.test(value.trim())
}

export function normalizeChunkFriendlyId(value: string): string {
  return value.trim().toUpperCase()
}

export type StoryAdminRef = {
  story_id: string
  friendly_id?: string | null
}

export function storyAdminHref(story: StoryAdminRef): string {
  const slug = story.friendly_id?.trim() || story.story_id
  return `/admin/stories/${slug}`
}
