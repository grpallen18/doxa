import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveStageSummaries } from '@/lib/admin/pipeline-status'
import { fetchStoryExtractionReview } from '@/lib/admin/story-extraction-review'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AdminSearchResult = {
  type: 'story' | 'claim' | 'position' | 'event' | 'agreement'
  id: string
  title: string
  subtitle: string | null
  href: string
  stageBadge: string | null
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
    .select('story_id, title, url, created_at')
    .order('created_at', { ascending: false })
    .limit(perType)

  if (UUID_RE.test(q)) {
    storyQuery = storyQuery.eq('story_id', q)
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
    let stageBadge: string | null = null
    try {
      const payload = await fetchStoryExtractionReview(supabase, row.story_id)
      if (payload) {
        const stages = deriveStageSummaries(row.story_id, payload)
        const current = stages.find((s) => s.status === 'current' || s.status === 'blocked')
        stageBadge = current?.label ?? (stages.every((s) => s.status === 'complete') ? 'Complete' : null)
      }
    } catch {
      stageBadge = null
    }
    results.push({
      type: 'story',
      id: row.story_id,
      title: row.title,
      subtitle: row.url,
      href: `/admin/stories/${row.story_id}`,
      stageBadge,
    })
  }

  for (const row of claimsRes.data ?? []) {
    results.push({
      type: 'claim',
      id: row.claim_id,
      title: (row.canonical_text as string).slice(0, 120),
      subtitle: 'Canonical claim',
      href: `/admin/records/claims/${row.claim_id}`,
      stageBadge: 'Canonical claim',
    })
  }

  for (const row of positionsRes.data ?? []) {
    results.push({
      type: 'position',
      id: row.canonical_position_id,
      title: (row.canonical_text as string).slice(0, 120),
      subtitle: 'Canonical position',
      href: `/admin/records/positions/${row.canonical_position_id}`,
      stageBadge: 'Canonical position',
    })
  }

  for (const row of eventsRes.data ?? []) {
    results.push({
      type: 'event',
      id: row.event_id,
      title: (row.canonical_text as string).slice(0, 120),
      subtitle: 'Canonical event',
      href: `/admin/records/events/${row.event_id}`,
      stageBadge: 'Canonical event',
    })
  }

  for (const row of agreementsRes.data ?? []) {
    results.push({
      type: 'agreement',
      id: row.agreement_cluster_id,
      title: ((row.label ?? row.summary) as string | null)?.slice(0, 120) ?? 'Agreement cluster',
      subtitle: 'Agreement cluster',
      href: `/admin/agreements/${row.agreement_cluster_id}`,
      stageBadge: 'Agreement',
    })
  }

  return results.slice(0, limit)
}
