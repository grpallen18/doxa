import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchStoryAuditEvents } from '@/lib/admin/story-audit'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { paginatedApiPayload, parseAuditListParams } from '@/lib/admin/api-pagination'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing story ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, id)
    if ('response' in resolved) return resolved.response

    const viewAll = request.nextUrl.searchParams.get('view') === 'all'
    const { limit, offset } = parseAuditListParams(
      request.nextUrl.searchParams,
      viewAll ? 'view_all' : 'embed'
    )
    const { events, total } = await fetchStoryAuditEvents(supabase, resolved.storyUuid, {
      limit,
      offset,
    })
    return NextResponse.json({
      data: paginatedApiPayload(events, limit, offset, total),
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
