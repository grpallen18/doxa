import type { SupabaseClient } from '@supabase/supabase-js'

export type PositionRecordHub = {
  canonical_position_id: string
  canonical_text: string
  created_at: string
  updated_at: string
  primary_topic_id: string | null
  story_contributors: Array<{
    story_position_id: string
    story_id: string
    raw_text: string
    extraction_confidence: number
    story_title: string | null
    story_url: string | null
  }>
  agreement_cluster_ids: string[]
}

export async function fetchPositionRecordHub(
  supabase: SupabaseClient,
  positionId: string
): Promise<PositionRecordHub | null> {
  const { data: position, error } = await supabase
    .from('canonical_positions')
    .select('canonical_position_id, canonical_text, created_at, updated_at, primary_topic_id')
    .eq('canonical_position_id', positionId)
    .single()

  if (error || !position) return null

  const [storyPositionsRes, clusterRes] = await Promise.all([
    supabase
      .from('story_positions')
      .select(
        'story_position_id, story_id, raw_text, extraction_confidence, stories(title, url)'
      )
      .eq('canonical_position_id', positionId),
    supabase
      .from('agreement_cluster_positions')
      .select('agreement_cluster_id')
      .eq('canonical_position_id', positionId),
  ])

  const story_contributors = (storyPositionsRes.data ?? []).map((row) => {
    const stories = row.stories as { title?: string; url?: string } | null
    return {
      story_position_id: row.story_position_id as string,
      story_id: row.story_id as string,
      raw_text: row.raw_text as string,
      extraction_confidence: Number(row.extraction_confidence),
      story_title: stories?.title ?? null,
      story_url: stories?.url ?? null,
    }
  })

  return {
    canonical_position_id: position.canonical_position_id as string,
    canonical_text: position.canonical_text as string,
    created_at: position.created_at as string,
    updated_at: position.updated_at as string,
    primary_topic_id: position.primary_topic_id as string | null,
    story_contributors,
    agreement_cluster_ids: (clusterRes.data ?? []).map(
      (r) => r.agreement_cluster_id as string
    ),
  }
}
