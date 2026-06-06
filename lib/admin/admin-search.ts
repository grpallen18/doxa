import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveStageSummaries } from '@/lib/admin/pipeline-status'
import { fetchStoryExtractionReview } from '@/lib/admin/story-extraction-review'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AdminSearchResult = {
  type: 'story' | 'claim' | 'position'
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

  const perType = Math.max(5, Math.ceil(limit / 3))
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

  const [storiesRes, claimsRes, positionsRes] = await Promise.all([
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
    const { data: link } = await supabase
      .from('story_claims')
      .select('story_id')
      .eq('claim_id', row.claim_id)
      .limit(1)
      .maybeSingle()

    const storyId = link?.story_id as string | undefined
    results.push({
      type: 'claim',
      id: row.claim_id,
      title: (row.canonical_text as string).slice(0, 120),
      subtitle: 'Canonical claim',
      href: storyId ? `/admin/stories/${storyId}` : `/admin?q=${encodeURIComponent(q)}`,
      stageBadge: 'Canonical claim',
    })
  }

  for (const row of positionsRes.data ?? []) {
    results.push({
      type: 'position',
      id: row.canonical_position_id,
      title: (row.canonical_text as string).slice(0, 120),
      subtitle: 'Canonical position',
      href: `/admin/positions?id=${row.canonical_position_id}`,
      stageBadge: 'Canonical position',
    })
  }

  return results.slice(0, limit)
}
