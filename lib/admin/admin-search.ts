import type { SupabaseClient } from '@supabase/supabase-js'
import { controversyDisplayName } from '@/lib/admin/controversy-display'
import { isStoryFriendlyId, isUuid, normalizeStoryFriendlyId, storyAdminHref } from '@/lib/admin/friendly-id'
import { sanitizePostgrestPattern } from '@/lib/supabase/filters'

export type AdminSearchEntityType = 'story' | 'controversy'

export type AdminSearchResult = {
  type: AdminSearchEntityType
  id: string
  title: string
  href: string
}

const ENTITY_LABELS: Record<AdminSearchEntityType, string> = {
  story: 'Story',
  controversy: 'Controversy',
}

export function adminSearchEntityLabel(type: AdminSearchEntityType): string {
  return ENTITY_LABELS[type]
}

export async function searchAdminRecords(
  supabase: SupabaseClient,
  query: string,
  limit: number
): Promise<AdminSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const perType = Math.max(4, Math.ceil(limit / 2))
  const results: AdminSearchResult[] = []
  const safe = sanitizePostgrestPattern(q)

  let storyQuery = supabase
    .from('stories')
    .select('story_id, friendly_id, title, url, created_at')
    .order('created_at', { ascending: false })
    .limit(perType)

  if (isUuid(q)) {
    storyQuery = storyQuery.eq('story_id', q)
  } else if (isStoryFriendlyId(q)) {
    storyQuery = storyQuery.eq('friendly_id', normalizeStoryFriendlyId(q))
  } else if (safe) {
    storyQuery = storyQuery.or(`title.ilike.%${safe}%,url.ilike.%${safe}%`)
  } else {
    return []
  }

  const controversyQuery = safe
    ? supabase
        .from('graph_controversies')
        .select('uid, title, summary, topic_key')
        .or(`title.ilike.%${safe}%,summary.ilike.%${safe}%,topic_key.ilike.%${safe}%`)
        .limit(perType)
    : null

  const [storiesRes, controversiesRes] = await Promise.all([
    storyQuery,
    controversyQuery ?? Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  for (const row of storiesRes.data ?? []) {
    results.push({
      type: 'story',
      id: (row.friendly_id as string) ?? row.story_id,
      title: row.title as string,
      href: storyAdminHref({
        story_id: row.story_id,
        friendly_id: row.friendly_id as string | undefined,
      }),
    })
  }

  for (const row of controversiesRes.data ?? []) {
    results.push({
      type: 'controversy',
      id: row.uid as string,
      title: controversyDisplayName({
        uid: row.uid as string,
        title: row.title as string | null,
        topic_key: row.topic_key as string | null,
      }),
      href: `/admin/graph-controversies/${encodeURIComponent(row.uid as string)}`,
    })
  }

  return results.slice(0, limit)
}
