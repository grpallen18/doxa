import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { NodeWithDetails } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const nodeId = params.id

    // Get the node
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .select('*')
      .eq('id', nodeId)
      .single()

    if (nodeError || !node) {
      return NextResponse.json(
        { data: null, error: { message: 'Node not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    // Get perspectives for this node
    const { data: nodePerspectives, error: perspectivesError } = await supabase
      .from('node_perspectives')
      .select(`
        *,
        perspective:perspectives(*)
      `)
      .eq('node_id', nodeId)
      .eq('version', node.version)

    if (perspectivesError) {
      console.error('Error fetching perspectives:', perspectivesError)
    }

    // Get sources
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('node_id', nodeId)
      .order('created_at', { ascending: false })

    if (sourcesError) {
      console.error('Error fetching sources:', sourcesError)
    }

    // Get relationships (both directions)
    const { data: relationships, error: relationshipsError } = await supabase
      .from('node_relationships')
      .select(`
        *,
        source_node:nodes!source_node_id(*),
        target_node:nodes!target_node_id(*)
      `)
      .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`)

    if (relationshipsError) {
      console.error('Error fetching relationships:', relationshipsError)
    }

    // Get validation stats
    const { data: validations, error: validationsError } = await supabase
      .from('validations')
      .select('perspective_id, is_represented')
      .eq('node_id', nodeId)
      .eq('node_version', node.version)

    let validationStats: NodeWithDetails['validation_stats'] = []
    if (!validationsError && validations) {
      // Aggregate by perspective
      const statsMap = new Map<string, { total: number; positive: number }>()
      
      validations.forEach((v) => {
        const key = v.perspective_id
        if (!statsMap.has(key)) {
          statsMap.set(key, { total: 0, positive: 0 })
        }
        const stats = statsMap.get(key)!
        stats.total++
        if (v.is_represented) {
          stats.positive++
        }
      })

      validationStats = Array.from(statsMap.entries()).map(([perspective_id, stats]) => ({
        perspective_id,
        total_validations: stats.total,
        positive_validations: stats.positive,
        validation_rate: stats.total > 0 ? stats.positive / stats.total : 0,
      }))
    }

    // Get perspective vote stats
    const { data: votes, error: votesError } = await supabase
      .from('perspective_votes')
      .select('perspective_id, vote_value')
      .eq('node_id', nodeId)
      .eq('node_version', node.version)

    let voteStats: NodeWithDetails['vote_stats'] = []
    if (!votesError && votes) {
      const voteMap = new Map<string, { up: number; down: number }>()

      votes.forEach((v) => {
        const key = v.perspective_id as string
        if (!voteMap.has(key)) {
          voteMap.set(key, { up: 0, down: 0 })
        }
        const stats = voteMap.get(key)!
        if (v.vote_value > 0) {
          stats.up++
        } else if (v.vote_value < 0) {
          stats.down++
        }
      })

      voteStats = Array.from(voteMap.entries()).map(([perspective_id, stats]) => ({
        perspective_id,
        upvotes: stats.up,
        downvotes: stats.down,
        net_score: stats.up - stats.down,
      }))
    }

    const nodeWithDetails: NodeWithDetails = {
      ...node,
      perspectives: (nodePerspectives || []).map((np: any) => ({
        ...np,
        perspective: np.perspective,
      })),
      sources: sources || [],
      relationships: relationships || [],
      validation_stats: validationStats,
      vote_stats: voteStats,
    }

    return NextResponse.json({ data: nodeWithDetails, error: null })
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}
