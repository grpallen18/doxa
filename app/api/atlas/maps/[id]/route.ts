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

    // Filter thesis nodes: only include those with thesis_text
    const thesisNodeIds = nodes
      .filter((n) => n.entity_type === 'thesis')
      .map((n) => n.entity_id)

    let filteredNodes = nodes
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
        (n) =>
          n.entity_type !== 'thesis' || validThesisIds.has(n.entity_id)
      )
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

    return NextResponse.json({
      data: {
        map: mapData,
        nodes: filteredNodes,
        edges: edges ?? [],
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
