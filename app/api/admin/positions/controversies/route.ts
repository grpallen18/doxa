import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns paginated list of controversies. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const status = searchParams.get('status') ?? 'active' // active | inactive; default active

    let query = supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id, question, summary, label, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status === 'active' || status === 'inactive') {
      query = query.eq('status', status)
    }

    const { data: controversies, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const ids = (controversies ?? []).map((c) => c.controversy_cluster_id)
    if (ids.length === 0) {
      return NextResponse.json({
        data: {
          items: [],
          total: 0,
        },
        error: null,
      })
    }

    const [posCountRes, vpCountRes] = await Promise.all([
      supabase
        .from('controversy_cluster_positions')
        .select('controversy_cluster_id')
        .in('controversy_cluster_id', ids),
      supabase
        .from('controversy_viewpoints')
        .select('controversy_cluster_id')
        .in('controversy_cluster_id', ids),
    ])

    const positionCountByControversy = new Map<string, number>()
    for (const row of posCountRes.data ?? []) {
      const cid = row.controversy_cluster_id as string
      positionCountByControversy.set(cid, (positionCountByControversy.get(cid) ?? 0) + 1)
    }
    const viewpointCountByControversy = new Map<string, number>()
    for (const row of vpCountRes.data ?? []) {
      const cid = row.controversy_cluster_id as string
      viewpointCountByControversy.set(cid, (viewpointCountByControversy.get(cid) ?? 0) + 1)
    }

    const items = (controversies ?? []).map((c) => ({
      controversy_cluster_id: c.controversy_cluster_id,
      question: c.question ?? null,
      summary: c.summary ?? null,
      label: (c as { label?: string | null }).label ?? null,
      status: c.status ?? 'active',
      created_at: c.created_at,
      position_count: positionCountByControversy.get(c.controversy_cluster_id) ?? 0,
      viewpoint_count: viewpointCountByControversy.get(c.controversy_cluster_id) ?? 0,
    }))

    let countQuery = supabase
      .from('controversy_clusters')
      .select('*', { count: 'exact', head: true })
    if (status === 'active' || status === 'inactive') {
      countQuery = countQuery.eq('status', status)
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
