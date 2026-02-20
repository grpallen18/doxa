import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const mapId = params.id
    const searchParams = request.nextUrl.searchParams
    const layer = searchParams.get('layer') // optional: filter by zoom layer (1, 2, 3)

    const { data: mapData, error: mapError } = await supabase
      .from('viz_maps')
      .select('*')
      .eq('id', mapId)
      .single()

    if (mapError || !mapData) {
      return NextResponse.json(
        { data: null, error: { message: 'Map not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    let nodesQuery = supabase
      .from('viz_nodes')
      .select('*')
      .eq('map_id', mapId)
      .order('layer', { ascending: true })

    if (layer) {
      const layerNum = parseInt(layer, 10)
      if (Number.isFinite(layerNum)) {
        nodesQuery = nodesQuery.lte('layer', layerNum)
      }
    }

    const { data: rawNodes, error: nodesError } = await nodesQuery

    if (nodesError) {
      return NextResponse.json(
        { data: null, error: { message: nodesError.message } },
        { status: 500 }
      )
    }

    const nodes = (rawNodes ?? []) as Array<{
      map_id: string
      entity_type: string
      entity_id: string
      [key: string]: unknown
    }>

    // Center node text: thesis (legacy) or viewpoint
    let filteredNodes = nodes
    let centerText: string | null = null

    if (mapData.scope_type === 'viewpoint' && mapData.scope_id) {
      const { data: vpRow } = await supabase
        .from('controversy_viewpoints')
        .select('title, summary')
        .eq('viewpoint_id', mapData.scope_id)
        .single()
      centerText = (vpRow?.title || vpRow?.summary || null) ?? null
    } else if (mapData.scope_type === 'thesis' && mapData.scope_id) {
      const thesisNodeIds = nodes.filter((n) => n.entity_type === 'thesis').map((n) => n.entity_id)
      if (thesisNodeIds.length > 0) {
        const { data: thesesWithText } = await supabase
          .from('theses')
          .select('thesis_id, thesis_text')
          .in('thesis_id', thesisNodeIds)
          .not('thesis_text', 'is', null)
        const validThesisIds = new Set(
          (thesesWithText ?? [])
            .filter((t) => t.thesis_text && String(t.thesis_text).trim() !== '')
            .map((t) => t.thesis_id as string)
        )
        filteredNodes = nodes.filter(
          (n) => n.entity_type !== 'thesis' || validThesisIds.has(n.entity_id)
        )
        const thesisRow = (thesesWithText ?? []).find((t) => t.thesis_id === mapData.scope_id)
        centerText = thesisRow?.thesis_text ?? null
      }
    }

    const { data: edges, error: edgesError } = await supabase
      .from('viz_edges')
      .select('*')
      .eq('map_id', mapId)

    if (edgesError) {
      return NextResponse.json(
        { data: null, error: { message: edgesError.message } },
        { status: 500 }
      )
    }

    // Build sourceDetails: top 20 claims by similarity, grouped by source
    const centerId = (mapData.scope_type === 'thesis' || mapData.scope_type === 'viewpoint') ? mapData.scope_id : null
    const centerType = mapData.scope_type === 'thesis' ? 'thesis' : mapData.scope_type === 'viewpoint' ? 'viewpoint' : null
    const rawEdges = (edges ?? []) as Array<{
      source_type: string
      source_id: string
      target_type: string
      target_id: string
      similarity_score?: number | null
    }>

    const claimEdges: { claimId: string; similarity: number }[] = []
    if (centerId && centerType) {
      for (const e of rawEdges) {
        if (e.source_type === centerType && e.source_id === centerId && e.target_type === 'claim') {
          claimEdges.push({ claimId: e.target_id, similarity: e.similarity_score ?? 0 })
        }
        if (e.target_type === centerType && e.target_id === centerId && e.source_type === 'claim') {
          claimEdges.push({ claimId: e.source_id, similarity: e.similarity_score ?? 0 })
        }
      }
    }
    claimEdges.sort((a, b) => b.similarity - a.similarity)
    const top20ClaimIds = claimEdges.slice(0, 20).map((c) => c.claimId)
    const claimSimilarityMap = new Map(claimEdges.map((c) => [c.claimId, c.similarity]))

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
        content_clean: string | null
        story_claims: Array<{
        story_claim_id: string
        raw_text: string | null
        linked_to_thesis: boolean
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

      const top20Set = new Set(top20ClaimIds)
      const sourceGroups = new Map<
        string,
        {
          source_name: string
          best_similarity: number
          stories: Map<
            string,
            { title: string | null; url: string | null; published_at: string | null; story_claims: Array<{ story_claim_id: string; raw_text: string | null }> }
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

      // Fetch content_clean from story_bodies for all stories
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

      // Fetch ALL story_claims for each story (not just linked ones), mark and sort
      const allStoryClaimsByStory = new Map<string, Array<{ story_claim_id: string; raw_text: string | null; claim_id: string }>>()
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
            content_clean: contentCleanMap.get(s.story_id) ?? null,
            story_claims: sortedClaims,
          }
        }),
      }))
    }

    return NextResponse.json({
      data: {
        map: mapData,
        nodes: filteredNodes,
        edges: edges ?? [],
        sourceDetails,
        thesisText: centerText,
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
