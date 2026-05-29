import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ScopeResponse } from '@/lib/atlas/types'
import type { PositionDetail, ClaimDetail } from '@/components/atlas/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type: scopeType, id: scopeId } = await params

  if (!scopeType || !scopeId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing type or id', code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  const supabase = await createClient()

  if (['topic', 'viewpoint'].includes(scopeType)) {
    return NextResponse.json(
      { data: null, error: { message: `Scope type ${scopeType} is not supported`, code: 'BAD_REQUEST' } },
      { status: 400 }
    )
  }

  try {
    if (scopeType === 'controversy') {
      const { data: controversy, error: ccErr } = await supabase
        .from('controversy_clusters')
        .select('controversy_cluster_id, question, summary')
        .eq('controversy_cluster_id', scopeId)
        .eq('status', 'active')
        .single()

      if (ccErr || !controversy) {
        return NextResponse.json(
          { data: null, error: { message: 'Controversy not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      }

      const { data: sideRows } = await supabase
        .from('controversy_cluster_agreements')
        .select('agreement_cluster_id, stance_label, agreement_clusters(label, summary)')
        .eq('controversy_cluster_id', scopeId)

      const { data: lineageRows } = await supabase
        .from('controversy_cluster_lineage')
        .select('agreement_cluster_relationship_id')
        .eq('controversy_cluster_id', scopeId)

      const agreementSides = []
      const outerNodes: Array<{ entity_type: 'position'; entity_id: string; label: string }> = []

      for (const side of sideRows ?? []) {
        const aid = side.agreement_cluster_id as string
        const acMeta = side.agreement_clusters as { label?: string; summary?: string } | null

        const { data: posRows } = await supabase
          .from('agreement_cluster_positions')
          .select('canonical_position_id')
          .eq('agreement_cluster_id', aid)
          .eq('membership_kind', 'core')

        const positionIds = (posRows ?? []).map((r) => r.canonical_position_id as string)

        const { data: claimRows } = await supabase
          .from('agreement_cluster_claims')
          .select('claim_id')
          .eq('agreement_cluster_id', aid)

        const claimIds = (claimRows ?? []).map((r) => r.claim_id as string)

        let storyIds: string[] = []
        if (positionIds.length > 0) {
          const { data: spRows } = await supabase
            .from('story_positions')
            .select('story_id')
            .in('canonical_position_id', positionIds)
          storyIds = [...new Set((spRows ?? []).map((r) => r.story_id as string))]
        }

        agreementSides.push({
          agreement_cluster_id: aid,
          stance_label: (side.stance_label as string) ?? null,
          label: acMeta?.label ?? null,
          summary: acMeta?.summary ?? null,
          position_ids: positionIds,
          claim_ids: claimIds,
          story_ids: storyIds,
        })

        for (const pid of positionIds.slice(0, 8)) {
          outerNodes.push({ entity_type: 'position', entity_id: pid, label: `Position ${pid.slice(0, 8)}` })
        }
      }

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'controversy',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription: (controversy.question || controversy.summary || 'Controversy') as string,
        outerNodes,
        agreementSides,
        lineage_relationship_ids: (lineageRows ?? []).map(
          (r) => r.agreement_cluster_relationship_id as string
        ),
      }

      return NextResponse.json({ data: response, error: null })
    }

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
        .eq('membership_kind', 'core')

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
          .from('story_position_claim_links')
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
