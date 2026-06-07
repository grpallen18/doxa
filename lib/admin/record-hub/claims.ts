import type { SupabaseClient } from '@supabase/supabase-js'

export type ClaimRecordHub = {
  claim_id: string
  canonical_text: string
  subject: string | null
  predicate: string | null
  object: string | null
  timeframe: string | null
  location: string | null
  created_at: string
  updated_at: string
  story_contributors: Array<{
    story_claim_id: string
    story_id: string
    raw_text: string
    extraction_confidence: number
    story_title: string | null
    story_url: string | null
  }>
  agreement_cluster_ids: string[]
}

export async function fetchClaimRecordHub(
  supabase: SupabaseClient,
  claimId: string
): Promise<ClaimRecordHub | null> {
  const { data: claim, error } = await supabase
    .from('claims')
    .select(
      'claim_id, canonical_text, subject, predicate, object, timeframe, location, created_at, updated_at'
    )
    .eq('claim_id', claimId)
    .single()

  if (error || !claim) return null

  const [storyClaimsRes, clusterRes] = await Promise.all([
    supabase
      .from('story_claims')
      .select('story_claim_id, story_id, raw_text, extraction_confidence, stories(title, url)')
      .eq('claim_id', claimId),
    supabase
      .from('agreement_cluster_claims')
      .select('agreement_cluster_id')
      .eq('claim_id', claimId),
  ])

  const story_contributors = (storyClaimsRes.data ?? []).map((row) => {
    const stories = row.stories as { title?: string; url?: string } | null
    return {
      story_claim_id: row.story_claim_id as string,
      story_id: row.story_id as string,
      raw_text: row.raw_text as string,
      extraction_confidence: Number(row.extraction_confidence),
      story_title: stories?.title ?? null,
      story_url: stories?.url ?? null,
    }
  })

  return {
    claim_id: claim.claim_id as string,
    canonical_text: claim.canonical_text as string,
    subject: claim.subject as string | null,
    predicate: claim.predicate as string | null,
    object: claim.object as string | null,
    timeframe: claim.timeframe as string | null,
    location: claim.location as string | null,
    created_at: claim.created_at as string,
    updated_at: claim.updated_at as string,
    story_contributors,
    agreement_cluster_ids: (clusterRes.data ?? []).map(
      (r) => r.agreement_cluster_id as string
    ),
  }
}
