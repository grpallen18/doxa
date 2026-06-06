import type { SupabaseClient } from '@supabase/supabase-js'

export type ClearCanonicalPreview = {
  linked_claims: number
  linked_events: number
  linked_positions: number
  shared_claims: number
  shared_events: number
  shared_positions: number
  orphan_claims: number
  orphan_events: number
  orphan_positions: number
}

export async function fetchClearCanonicalPreview(
  supabase: SupabaseClient,
  storyId: string
): Promise<ClearCanonicalPreview> {
  const [claimsRes, eventsRes, positionsRes] = await Promise.all([
    supabase.from('story_claims').select('claim_id').eq('story_id', storyId).not('claim_id', 'is', null),
    supabase.from('story_events').select('event_id').eq('story_id', storyId).not('event_id', 'is', null),
    supabase
      .from('story_positions')
      .select('canonical_position_id')
      .eq('story_id', storyId)
      .not('canonical_position_id', 'is', null),
  ])

  const claimIds = [...new Set((claimsRes.data ?? []).map((r) => r.claim_id as string))]
  const eventIds = [...new Set((eventsRes.data ?? []).map((r) => r.event_id as string))]
  const positionIds = [
    ...new Set((positionsRes.data ?? []).map((r) => r.canonical_position_id as string)),
  ]

  const countShared = async (
    table: 'story_claims' | 'story_events' | 'story_positions',
    column: 'claim_id' | 'event_id' | 'canonical_position_id',
    ids: string[]
  ) => {
    if (ids.length === 0) return 0
    const { data } = await supabase
      .from(table)
      .select(column)
      .in(column, ids)
      .neq('story_id', storyId)
    const shared = new Set(
      (data ?? []).map((r) => (r as Record<typeof column, string | null>)[column] as string)
    )
    return shared.size
  }

  const [sharedClaims, sharedEvents, sharedPositions] = await Promise.all([
    countShared('story_claims', 'claim_id', claimIds),
    countShared('story_events', 'event_id', eventIds),
    countShared('story_positions', 'canonical_position_id', positionIds),
  ])

  return {
    linked_claims: claimIds.length,
    linked_events: eventIds.length,
    linked_positions: positionIds.length,
    shared_claims: sharedClaims,
    shared_events: sharedEvents,
    shared_positions: sharedPositions,
    orphan_claims: claimIds.length - sharedClaims,
    orphan_events: eventIds.length - sharedEvents,
    orphan_positions: positionIds.length - sharedPositions,
  }
}
