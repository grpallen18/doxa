import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns controversy, position, and viewpoint counts for a single topic. Admin only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id: topicId } = await params
  if (!topicId) {
    return NextResponse.json(
      { data: null, error: { message: 'Topic ID required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    const { data: tcRows } = await supabase
      .from('topic_controversies')
      .select('controversy_cluster_id')
      .eq('topic_id', topicId)

    const cids = (tcRows ?? []).map((r) => r.controversy_cluster_id as string)
    const controversy_count = cids.length

    if (cids.length === 0) {
      return NextResponse.json({
        data: { controversy_count: 0, position_count: 0, viewpoint_count: 0 },
        error: null,
      })
    }

    const [posRes, vpRes] = await Promise.all([
      supabase
        .from('controversy_cluster_positions')
        .select('controversy_cluster_id')
        .in('controversy_cluster_id', cids),
      supabase
        .from('controversy_viewpoints')
        .select('controversy_cluster_id')
        .in('controversy_cluster_id', cids),
    ])

    const position_count = (posRes.data ?? []).length
    const viewpoint_count = (vpRes.data ?? []).length

    return NextResponse.json({
      data: { controversy_count, position_count, viewpoint_count },
      error: null,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
