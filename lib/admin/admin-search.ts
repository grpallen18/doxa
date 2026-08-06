import type { SupabaseClient } from '@supabase/supabase-js'
import { isStoryFriendlyId, isUuid, normalizeStoryFriendlyId, storyAdminHref } from '@/lib/admin/friendly-id'

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

  let storyQuery = supabase
    .from('stories')
    .select('story_id, friendly_id, title, url, created_at')
    .order('created_at', { ascending: false })
    .limit(perType)

  if (isUuid(q)) {
    storyQuery = storyQuery.eq('story_id', q)
  } else if (isStoryFriendlyId(q)) {
    storyQuery = storyQuery.eq('friendly_id', normalizeStoryFriendlyId(q))
  } else {
    storyQuery = storyQuery.or(`title.ilike.%${q}%,url.ilike.%${q}%`)
  }

  const [storiesRes, controversiesRes] = await Promise.all([
    storyQuery,
    supabase
      .from('graph_controversies')
      .select('uid, title, summary')
      .or(`title.ilike.%${q}%,summary.ilike.%${q}%,topic_key.ilike.%${q}%`)
      .limit(perType),
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
      title: (row.title as string) || (row.uid as string),
      href: `/admin/graph-controversies/${encodeURIComponent(row.uid as string)}`,
    })
  }

  return results.slice(0, limit)
}
