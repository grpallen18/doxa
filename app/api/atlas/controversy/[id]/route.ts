import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns graph data for a controversy: center node + sourceDetails from claims in its positions. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const controversyId = params.id

  try {
    const { data: controversy, error: ccErr } = await supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id, question, summary')
      .eq('controversy_cluster_id', controversyId)
      .eq('status', 'active')
      .single()

    if (ccErr || !controversy) {
      return NextResponse.json(
        { data: null, error: { message: 'Controversy not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const { data: positionLinks } = await supabase
      .from('controversy_cluster_positions')
      .select('position_cluster_id')
      .eq('controversy_cluster_id', controversyId)

    const positionIds = (positionLinks ?? []).map((r) => r.position_cluster_id as string)
    if (positionIds.length === 0) {
      return NextResponse.json({
        data: {
          nodes: [
            {
              map_id: '',
              entity_type: 'controversy',
              entity_id: controversyId,
              layer: 1,
              size: 1.5,
            },
          ],
          edges: [],
          sourceDetails: [],
          thesisText: null,
          viewpointText: (controversy.question || controversy.summary) ?? null,
        },
        error: null,
      })
    }

    const { data: pccRows } = await supabase
      .from('position_cluster_claims')
      .select('claim_id')
      .in('position_cluster_id', positionIds)

    const claimIds = [...new Set((pccRows ?? []).map((r) => r.claim_id as string))]
    const top20ClaimIds = claimIds.slice(0, 20)
    const claimSimilarityMap = new Map(top20ClaimIds.map((c) => [c, 1.0]))
    const top20Set = new Set(top20ClaimIds)

    let sourceDetails: Array<{
      source_id: string
      source_name: string
      story_count: number
      best_similarity: number
      stories: Array<{
        story_id: string
        title: string | null
        url: string | null
        published_at: string | null
        story_claims: Array<{
          story_claim_id: string
          raw_text: string | null
          linked_to_viewpoint: boolean
        }>
      }>
    }> = []

    if (top20ClaimIds.length > 0) {
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

      sourceDetails = storiesArray.map((sd) => ({
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
            story_claims: sortedClaims,
          }
        }),
      }))
    }

    const centerText = (controversy.question || controversy.summary) ?? null

    return NextResponse.json({
      data: {
        nodes: [
          {
            map_id: '',
            entity_type: 'controversy',
            entity_id: controversyId,
            layer: 1,
            size: 1.5,
          },
        ],
        edges: [],
        sourceDetails,
        thesisText: null,
        viewpointText: centerText,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
