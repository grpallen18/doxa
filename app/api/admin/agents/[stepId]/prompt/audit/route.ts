import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getAgentDetail } from '@/lib/admin/agent-detail'
import { fetchAgentPromptAudit } from '@/lib/admin/agent-prompt-store'
import { paginatedApiPayload, parseAuditListParams } from '@/lib/admin/api-pagination'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { stepId } = await params
  if (!getAgentDetail(stepId)) {
    return NextResponse.json(
      { data: null, error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  try {
    const supabase = createAdminClient()
    const viewAll = request.nextUrl.searchParams.get('view') === 'all'
    const { limit, offset } = parseAuditListParams(
      request.nextUrl.searchParams,
      viewAll ? 'view_all' : 'embed'
    )
    const { events, total } = await fetchAgentPromptAudit(supabase, stepId, { limit, offset })
    return NextResponse.json({
      data: paginatedApiPayload(events, limit, offset, total),
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
