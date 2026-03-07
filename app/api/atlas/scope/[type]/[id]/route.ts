import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ScopeResponse } from '@/lib/atlas/types'
import type { PositionDetail, ClaimDetail } from '@/components/atlas/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  const scopeType = params.type
  const scopeId = params.id

  if (!scopeType || !scopeId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing type or id', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  if (['topic', 'controversy', 'viewpoint'].includes(scopeType)) {
    return NextResponse.json(
      { data: null, error: { message: `Scope type ${scopeType} is not supported`, code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  try {
    if (scopeType === 'agreement') {
      const { data: agreement, error: acErr } = await supabase
        .from('agreement_clusters')
        .select('agreement_cluster_id, label, summary')
        .eq('agreement_cluster_id', scopeId)
        .eq('status', 'active')
        .single()

      if (acErr || !agreement) {
        return NextResponse.json(
          { data: null, error: { message: 'Agreement cluster not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      }

      const { data: acpRows } = await supabase
        .from('agreement_cluster_positions')
        .select('canonical_position_id')
        .eq('agreement_cluster_id', scopeId)

      const positionIds = [...new Set((acpRows ?? []).map((r) => r.canonical_position_id as string))]
      let positionDetails: PositionDetail[] = []
      let outerNodes: Array<{ entity_type: 'position'; entity_id: string; label: string }> = []

      if (positionIds.length > 0) {
        const { data: posRows } = await supabase
          .from('canonical_positions')
          .select('canonical_position_id, canonical_text')
          .in('canonical_position_id', positionIds)

        positionDetails = (posRows ?? []).map((r) => ({
          canonical_position_id: r.canonical_position_id as string,
          canonical_text: (r.canonical_text as string) ?? null,
        }))
        outerNodes = positionDetails.map((p) => ({
          entity_type: 'position' as const,
          entity_id: p.canonical_position_id,
          label: (p.canonical_text ?? 'Position').slice(0, 80),
        }))
      }

      const centerDescription = (agreement.summary || agreement.label || 'Agreement cluster') as string

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'agreement',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription,
        outerNodes,
        positionDetails,
      }

      return NextResponse.json({ data: response, error: null })
    }

    if (scopeType === 'position') {
      const { data: position, error: posErr } = await supabase
        .from('canonical_positions')
        .select('canonical_position_id, canonical_text')
        .eq('canonical_position_id', scopeId)
        .single()

      if (posErr || !position) {
        return NextResponse.json(
          { data: null, error: { message: 'Position not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      }

      const { data: spRows } = await supabase
        .from('story_positions')
        .select('story_position_id')
        .eq('canonical_position_id', scopeId)

      const storyPositionIds = (spRows ?? []).map((r) => r.story_position_id as string)
      let claimDetails: ClaimDetail[] = []
      let outerNodes: Array<{ entity_type: 'claim'; entity_id: string; label: string }> = []

      if (storyPositionIds.length > 0) {
        const { data: spcRows } = await supabase
          .from('story_position_claims')
          .select('story_claim_id')
          .in('story_position_id', storyPositionIds)

        const storyClaimIds = [...new Set((spcRows ?? []).map((r) => r.story_claim_id as string))]
        if (storyClaimIds.length > 0) {
          const { data: scRows } = await supabase
            .from('story_claims')
            .select('story_claim_id, claim_id, raw_text')
            .in('story_claim_id', storyClaimIds)

          const claimIds = [...new Set((scRows ?? []).map((r) => r.claim_id as string).filter(Boolean))]
          if (claimIds.length > 0) {
            const { data: claimRows } = await supabase
              .from('claims')
              .select('claim_id, canonical_text')
              .in('claim_id', claimIds)

            claimDetails = (claimRows ?? []).map((r) => ({
              claim_id: r.claim_id as string,
              raw_text: (r.canonical_text as string) ?? null,
            }))
            outerNodes = claimDetails.map((c) => ({
              entity_type: 'claim' as const,
              entity_id: c.claim_id,
              label: (c.raw_text ?? 'Claim').slice(0, 80),
            }))
          }
        }
      }

      const centerDescription = (position.canonical_text ?? 'Position') as string

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'position',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription,
        outerNodes,
        claimDetails,
      }

      return NextResponse.json({ data: response, error: null })
    }

    return NextResponse.json(
      { data: null, error: { message: `Unknown scope type: ${scopeType}`, code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
