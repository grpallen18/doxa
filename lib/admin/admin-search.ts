import type { SupabaseClient } from '@supabase/supabase-js'
import { isStoryFriendlyId, isUuid, normalizeStoryFriendlyId, storyAdminHref } from '@/lib/admin/friendly-id'

export type AdminSearchEntityType = 'story' | 'claim' | 'position' | 'event' | 'agreement'

export type AdminSearchResult = {
  type: AdminSearchEntityType
  id: string
  /** Display name for the record (story title, canonical text, cluster label, etc.). */
  title: string
  href: string
}

const ENTITY_LABELS: Record<AdminSearchEntityType, string> = {
  story: 'Story',
  claim: 'Claim',
  position: 'Position',
  event: 'Event',
  agreement: 'Agreement',
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

  const perType = Math.max(4, Math.ceil(limit / 5))
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

  const [storiesRes, claimsRes, positionsRes, eventsRes, agreementsRes] = await Promise.all([
    storyQuery,
    supabase
      .from('claims')
      .select('claim_id, canonical_text')
      .ilike('canonical_text', `%${q}%`)
      .limit(perType),
    supabase
      .from('canonical_positions')
      .select('canonical_position_id, canonical_text')
      .ilike('canonical_text', `%${q}%`)
      .limit(perType),
    supabase
      .from('events')
      .select('event_id, canonical_text')
      .ilike('canonical_text', `%${q}%`)
      .limit(perType),
    supabase
      .from('agreement_clusters')
      .select('agreement_cluster_id, label, summary')
      .or(`label.ilike.%${q}%,summary.ilike.%${q}%`)
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

  for (const row of claimsRes.data ?? []) {
    results.push({
      type: 'claim',
      id: row.claim_id,
      title: row.canonical_text as string,
      href: `/admin/records/claims/${row.claim_id}`,
    })
  }

  for (const row of positionsRes.data ?? []) {
    results.push({
      type: 'position',
      id: row.canonical_position_id,
      title: row.canonical_text as string,
      href: `/admin/records/positions/${row.canonical_position_id}`,
    })
  }

  for (const row of eventsRes.data ?? []) {
    results.push({
      type: 'event',
      id: row.event_id,
      title: row.canonical_text as string,
      href: `/admin/records/events/${row.event_id}`,
    })
  }

  for (const row of agreementsRes.data ?? []) {
    results.push({
      type: 'agreement',
      id: row.agreement_cluster_id,
      title: ((row.label ?? row.summary) as string | null) ?? 'Agreement cluster',
      href: `/admin/agreements/${row.agreement_cluster_id}`,
    })
  }

  return results.slice(0, limit)
}
