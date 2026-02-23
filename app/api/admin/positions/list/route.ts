import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns paginated list of positions. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const status = searchParams.get('status') ?? 'active' // active | inactive; default active
    const search = searchParams.get('search')?.trim() || ''

    let query = supabase
      .from('position_clusters')
      .select('position_cluster_id, label, summary, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status === 'active' || status === 'inactive') {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(`label.ilike.%${search}%,summary.ilike.%${search}%`)
    }

    const { data: positions, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const ids = (positions ?? []).map((p) => p.position_cluster_id)
    if (ids.length === 0) {
      return NextResponse.json({
        data: {
          items: [],
          total: 0,
        },
        error: null,
      })
    }

    const { data: claimCounts } = await supabase
      .from('position_cluster_claims')
      .select('position_cluster_id')
      .in('position_cluster_id', ids)

    const claimCountByPosition = new Map<string, number>()
    for (const row of claimCounts ?? []) {
      const pid = row.position_cluster_id as string
      claimCountByPosition.set(pid, (claimCountByPosition.get(pid) ?? 0) + 1)
    }

    const { data: controversyRows } = await supabase
      .from('controversy_cluster_positions')
      .select('position_cluster_id')
      .in('position_cluster_id', ids)

    const controversyCountByPosition = new Map<string, number>()
    for (const row of controversyRows ?? []) {
      const pid = row.position_cluster_id as string
      controversyCountByPosition.set(pid, (controversyCountByPosition.get(pid) ?? 0) + 1)
    }

    const items = (positions ?? []).map((p) => ({
      position_cluster_id: p.position_cluster_id,
      label: p.label ?? null,
      summary: p.summary ?? null,
      status: p.status ?? 'active',
      created_at: p.created_at,
      claim_count: claimCountByPosition.get(p.position_cluster_id) ?? 0,
      controversy_count: controversyCountByPosition.get(p.position_cluster_id) ?? 0,
    }))

    let countQuery = supabase
      .from('position_clusters')
      .select('*', { count: 'exact', head: true })
    if (status === 'active' || status === 'inactive') {
      countQuery = countQuery.eq('status', status)
    }
    if (search) {
      countQuery = countQuery.or(`label.ilike.%${search}%,summary.ilike.%${search}%`)
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
