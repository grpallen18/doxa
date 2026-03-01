import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ScopeResponse } from '@/lib/atlas/types'
import type { SourceDetail, ControversyDetail } from '@/components/atlas/types'

type SourceDetailInternal = Array<{
  source_id: string
  source_name: string
  story_count: number
  best_similarity: number
  stories: Array<{
    story_id: string
    title: string | null
    url: string | null
    published_at: string | null
    content_clean: string | null
    story_claims: Array<{
      story_claim_id: string
      raw_text: string | null
      linked_to_viewpoint: boolean
    }>
  }>
}>

async function buildSourceDetailsFromClaimIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claimIds: string[]
): Promise<SourceDetailInternal> {
  const top20ClaimIds = claimIds.slice(0, 20)
  const claimSimilarityMap = new Map(top20ClaimIds.map((c) => [c, 1.0]))
  const top20Set = new Set(top20ClaimIds)

  if (top20ClaimIds.length === 0) return []

  const { data: storyClaimsData } = await supabase
    .from('story_claims')
    .select(
      'story_claim_id, claim_id, raw_text, stories ( story_id, title, url, published_at, source_id, sources ( source_id, name ) )'
    )
    .in('claim_id', top20ClaimIds)

  const sourceGroups = new Map<
    string,
    {
      source_name: string
      best_similarity: number
      stories: Map<
        string,
        {
          title: string | null
          url: string | null
          published_at: string | null
          story_claims: Array<{ story_claim_id: string; raw_text: string | null }>
        }
      >
    }
  >()

  for (const sc of storyClaimsData ?? []) {
    const cid = sc.claim_id as string
    if (!top20Set.has(cid)) continue
    const stories = sc.stories as unknown as {
      story_id: string
      title: string | null
      url: string | null
      published_at: string | null
      source_id: string
      sources: { source_id: string; name: string } | null
    } | null
    if (!stories?.source_id || !stories.sources?.name) continue

    const sim = claimSimilarityMap.get(cid) ?? 0
    let srcGroup = sourceGroups.get(stories.source_id)
    if (!srcGroup) {
      srcGroup = {
        source_name: stories.sources.name,
        best_similarity: sim,
        stories: new Map(),
      }
      sourceGroups.set(stories.source_id, srcGroup)
    }
    srcGroup.best_similarity = Math.max(srcGroup.best_similarity, sim)

    let storyGroup = srcGroup.stories.get(stories.story_id)
    if (!storyGroup) {
      storyGroup = {
        title: stories.title,
        url: stories.url,
        published_at: stories.published_at ?? null,
        story_claims: [],
      }
      srcGroup.stories.set(stories.story_id, storyGroup)
    }
    storyGroup.story_claims.push({
      story_claim_id: sc.story_claim_id as string,
      raw_text: (sc.raw_text as string) ?? null,
    })
  }

  const storiesArray = Array.from(sourceGroups.entries())
    .map(([source_id, g]) => ({
      source_id,
      source_name: g.source_name,
      story_count: g.stories.size,
      best_similarity: g.best_similarity,
      stories: Array.from(g.stories.entries()).map(([story_id, s]) => ({
        story_id,
        title: s.title,
        url: s.url,
        published_at: s.published_at ?? null,
        story_claims: s.story_claims,
      })),
    }))
    .sort((a, b) => b.story_count - a.story_count)

  const allStoryIds = storiesArray.flatMap((sd) => sd.stories.map((s) => s.story_id))
  const uniqueStoryIds = [...new Set(allStoryIds)]
  const contentCleanMap = new Map<string, string | null>()
  if (uniqueStoryIds.length > 0) {
    const { data: bodies } = await supabase
      .from('story_bodies')
      .select('story_id, content_clean')
      .in('story_id', uniqueStoryIds)
    for (const row of bodies ?? []) {
      contentCleanMap.set(row.story_id as string, (row.content_clean as string) ?? null)
    }
  }

  const allStoryClaimsByStory = new Map<
    string,
    Array<{ story_claim_id: string; raw_text: string | null; claim_id: string }>
  >()
  if (uniqueStoryIds.length > 0) {
    const { data: allClaims } = await supabase
      .from('story_claims')
      .select('story_claim_id, claim_id, raw_text, story_id')
      .in('story_id', uniqueStoryIds)
    for (const row of allClaims ?? []) {
      const sid = row.story_id as string
      let list = allStoryClaimsByStory.get(sid)
      if (!list) {
        list = []
        allStoryClaimsByStory.set(sid, list)
      }
      list.push({
        story_claim_id: row.story_claim_id as string,
        raw_text: (row.raw_text as string) ?? null,
        claim_id: row.claim_id as string,
      })
    }
  }

  return storiesArray.map((sd) => ({
    ...sd,
    stories: sd.stories.map((s) => {
      const allClaims = allStoryClaimsByStory.get(s.story_id) ?? []
      const sortedClaims = allClaims
        .map((sc) => ({
          story_claim_id: sc.story_claim_id,
          raw_text: sc.raw_text,
          linked_to_viewpoint: top20Set.has(sc.claim_id),
        }))
        .sort((a, b) => (b.linked_to_viewpoint ? 1 : 0) - (a.linked_to_viewpoint ? 1 : 0))
      return {
        ...s,
        published_at: s.published_at ?? null,
        content_clean: contentCleanMap.get(s.story_id) ?? null,
        story_claims: sortedClaims,
      }
    }),
  }))
}

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

  try {
    if (scopeType === 'topic') {
      const { data: topic, error: topicErr } = await supabase
        .from('topics')
        .select('topic_id, title, summary')
        .eq('topic_id', scopeId)
        .single()

      if (topicErr || !topic) {
        return NextResponse.json(
          { data: null, error: { message: 'Topic not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      }

      const { data: tcRows } = await supabase
        .from('topic_controversies')
        .select('controversy_cluster_id, similarity_score, rank, controversy_clusters(question, summary)')
        .eq('topic_id', scopeId)
        .order('rank', { ascending: true })

      const controversyDetails: ControversyDetail[] = (tcRows ?? []).map((row) => {
        const cc = row.controversy_clusters as { question?: string | null; summary?: string | null } | null | undefined
        return {
          controversy_cluster_id: row.controversy_cluster_id as string,
          question: (Array.isArray(cc) ? cc[0]?.question : cc?.question) ?? null,
          summary: (Array.isArray(cc) ? cc[0]?.summary : cc?.summary) ?? null,
        }
      })

      const outerNodes = controversyDetails.map((c) => ({
        entity_type: 'controversy' as const,
        entity_id: c.controversy_cluster_id,
        label: (c.question || c.summary || 'Controversy').slice(0, 80),
      }))

      const centerDescription = (topic.summary || topic.title) ?? ''

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'topic',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription,
        outerNodes,
        controversyDetails,
      }

      return NextResponse.json({ data: response, error: null })
    }

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

      const { data: vpRows } = await supabase
        .from('controversy_viewpoints')
        .select('viewpoint_id, controversy_cluster_id, agreement_cluster_id, title, summary')
        .eq('controversy_cluster_id', scopeId)

      const viewpointDetails = (vpRows ?? []).map((r) => ({
        viewpoint_id: r.viewpoint_id as string,
        controversy_cluster_id: r.controversy_cluster_id as string,
        position_cluster_id: (r.agreement_cluster_id ?? r.position_cluster_id) as string,
        title: (r.title as string) ?? null,
        summary: (r.summary as string) ?? null,
      }))

      const outerNodes = viewpointDetails.map((vp) => ({
        entity_type: 'viewpoint' as const,
        entity_id: vp.viewpoint_id,
        label: (vp.title || vp.summary || 'Viewpoint').slice(0, 80),
      }))

      const centerDescription = (controversy.question || controversy.summary) ?? ''

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'controversy',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription,
        outerNodes,
        viewpointDetails,
      }

      return NextResponse.json({ data: response, error: null })
    }

    if (scopeType === 'viewpoint') {
      const { data: vpRow, error: vpErr } = await supabase
        .from('controversy_viewpoints')
        .select('viewpoint_id, controversy_cluster_id, agreement_cluster_id, title, summary')
        .eq('viewpoint_id', scopeId)
        .single()

      if (vpErr || !vpRow) {
        return NextResponse.json(
          { data: null, error: { message: 'Viewpoint not found', code: 'NOT_FOUND' } },
          { status: 404 }
        )
      }

      const agreementClusterId = (vpRow.agreement_cluster_id ?? vpRow.position_cluster_id) as string

      const { data: accRows } = await supabase
        .from('agreement_cluster_claims')
        .select('claim_id')
        .eq('agreement_cluster_id', agreementClusterId)

      const claimIds = [...new Set((accRows ?? []).map((r) => r.claim_id as string))]
      const sourceDetails = await buildSourceDetailsFromClaimIds(supabase, claimIds)

      const outerNodes = sourceDetails.map((sd) => ({
        entity_type: 'source' as const,
        entity_id: sd.source_id,
        label: sd.source_name,
      }))

      const centerDescription = (vpRow.summary || vpRow.title || 'Viewpoint') as string

      const response: ScopeResponse = {
        centerNode: {
          map_id: '',
          entity_type: 'viewpoint',
          entity_id: scopeId,
          layer: 1,
          size: 1.5,
        },
        centerDescription,
        outerNodes,
        sourceDetails: sourceDetails as SourceDetail[],
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
