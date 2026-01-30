import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Get all nodes
    const { data: nodes, error: nodesError } = await supabase
      .from('nodes')
      .select('id, question, status')
      .in('status', ['under_review', 'stable'])

    if (nodesError) {
      return NextResponse.json(
        { data: null, error: { message: nodesError.message, code: nodesError.code } },
        { status: 500 }
      )
    }

    // Get all relationships
    const { data: relationships, error: relationshipsError } = await supabase
      .from('node_relationships')
      .select('id, source_node_id, target_node_id, relationship_type')

    if (relationshipsError) {
      return NextResponse.json(
        { data: null, error: { message: relationshipsError.message, code: relationshipsError.code } },
        { status: 500 }
      )
    }

    // Format for graph visualization (react-force-graph format)
    const graphData = {
      nodes: (nodes || []).map((node) => ({
        id: node.id,
        question: node.question,
        status: node.status,
      })),
      links: (relationships || []).map((rel) => ({
        id: rel.id,
        source: rel.source_node_id,
        target: rel.target_node_id,
        type: rel.relationship_type,
      })),
    }

    return NextResponse.json({ data: graphData, error: null })
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}
