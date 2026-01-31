import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  const supabase = await createClient()
  try {
    const nodeId = params.nodeId

    // Get node version
    const { data: node, error: nodeError } = await supabase
      .from('nodes')
      .select('version')
      .eq('id', nodeId)
      .single()

    if (nodeError || !node) {
      return NextResponse.json(
        { data: null, error: { message: 'Node not found' } },
        { status: 404 }
      )
    }

    // Get all validations for this node version
    const { data: validations, error: validationsError } = await supabase
      .from('validations')
      .select('perspective_id, is_represented')
      .eq('node_id', nodeId)
      .eq('node_version', node.version)

    if (validationsError) {
      return NextResponse.json(
        { data: null, error: { message: validationsError.message, code: validationsError.code } },
        { status: 500 }
      )
    }

    // Aggregate by perspective
    const statsMap = new Map<string, { total: number; positive: number }>()
    
    ;(validations || []).forEach((v) => {
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

    const stats = Array.from(statsMap.entries()).map(([perspective_id, data]) => ({
      perspective_id,
      total_validations: data.total,
      positive_validations: data.positive,
      validation_rate: data.total > 0 ? data.positive / data.total : 0,
    }))

    return NextResponse.json({ data: stats, error: null })
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}
