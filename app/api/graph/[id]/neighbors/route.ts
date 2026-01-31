import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const nodeId = params.id
    const searchParams = request.nextUrl.searchParams
    const relationshipType = searchParams.get('relationship_type')
    const depth = parseInt(searchParams.get('depth') || '1')

    // Get relationships where this node is source or target
    let query = supabase
      .from('node_relationships')
      .select(`
        *,
        source_node:nodes!node_relationships_source_node_id_fkey(id, question, status),
        target_node:nodes!node_relationships_target_node_id_fkey(id, question, status)
      `)
      .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)

    if (relationshipType) {
      query = query.eq('relationship_type', relationshipType)
    }

    const { data: relationships, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    // Format neighbors
    const neighbors = (relationships || []).map((rel) => {
      const isSource = rel.source_node_id === nodeId
      const neighborNode = isSource ? rel.target_node : rel.source_node
      
      return {
        node: neighborNode,
        relationship: {
          id: rel.id,
          type: rel.relationship_type,
          direction: isSource ? 'outgoing' : 'incoming',
        },
      }
    })

    return NextResponse.json({ data: neighbors, error: null })
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}
