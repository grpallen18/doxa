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

    const { data: nodes, error: nodesError } = await nodesQuery

    if (nodesError) {
      return NextResponse.json(
        { data: null, error: { message: nodesError.message } },
        { status: 500 }
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
        nodes: nodes ?? [],
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
