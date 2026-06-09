import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchAgentRecentRuns, getAgentDetail } from '@/lib/admin/agent-detail'
import { paginatedApiPayload, parseAuditListParams } from '@/lib/admin/api-pagination'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { stepId } = await params
  const agent = getAgentDetail(stepId)
  if (!agent) {
    return NextResponse.json(
      { data: null, error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  const viewAll = request.nextUrl.searchParams.get('view') === 'all'
  const { limit, offset } = parseAuditListParams(
    request.nextUrl.searchParams,
    viewAll ? 'view_all' : 'embed'
  )

  try {
    const supabase = createAdminClient()
    const { runs, total } = await fetchAgentRecentRuns(supabase, agent.deployName, {
      limit,
      offset,
    })

    return NextResponse.json({
      data: paginatedApiPayload(runs, limit, offset, total, 'runs'),
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
