import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns paginated list of viewpoints. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const controversyId = searchParams.get('controversy_id')?.trim()
    const positionId = searchParams.get('position_id')?.trim()

    let query = supabase
      .from('controversy_viewpoints')
      .select('viewpoint_id, title, summary, controversy_cluster_id, position_cluster_id, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (controversyId) {
      query = query.eq('controversy_cluster_id', controversyId)
    }
    if (positionId) {
      query = query.eq('position_cluster_id', positionId)
    }

    const { data: viewpoints, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const vpRows = viewpoints ?? []
    if (vpRows.length === 0) {
      return NextResponse.json({
        data: {
          items: [],
          total: 0,
        },
        error: null,
      })
    }

    const controversyIds = [...new Set(vpRows.map((v) => v.controversy_cluster_id))]
    const positionIds = [...new Set(vpRows.map((v) => v.position_cluster_id))]

    const [ccRes, pcRes] = await Promise.all([
      supabase
        .from('controversy_clusters')
        .select('controversy_cluster_id, question')
        .in('controversy_cluster_id', controversyIds),
      supabase
        .from('position_clusters')
        .select('position_cluster_id, label')
        .in('position_cluster_id', positionIds),
    ])

    const questionByControversy = new Map(
      (ccRes.data ?? []).map((r) => [r.controversy_cluster_id, r.question ?? null])
    )
    const labelByPosition = new Map(
      (pcRes.data ?? []).map((r) => [r.position_cluster_id, r.label ?? null])
    )

    const items = vpRows.map((v) => ({
      viewpoint_id: v.viewpoint_id,
      title: v.title,
      summary: v.summary,
      controversy_cluster_id: v.controversy_cluster_id,
      position_cluster_id: v.position_cluster_id,
      controversy_question: questionByControversy.get(v.controversy_cluster_id) ?? null,
      position_label: labelByPosition.get(v.position_cluster_id) ?? null,
      created_at: v.created_at,
    }))

    let countQuery = supabase
      .from('controversy_viewpoints')
      .select('*', { count: 'exact', head: true })
    if (controversyId) {
      countQuery = countQuery.eq('controversy_cluster_id', controversyId)
    }
    if (positionId) {
      countQuery = countQuery.eq('position_cluster_id', positionId)
    }
    const { count } = await countQuery

    return NextResponse.json({
      data: {
        items,
        total: count ?? items.length,
      },
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
