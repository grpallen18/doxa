import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchAgentRecentRuns, getAgentDetail } from '@/lib/admin/agent-detail'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stepId: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { stepId } = await params
  if (!stepId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing step ID' } },
      { status: 400 }
    )
  }

  const agent = getAgentDetail(stepId)
  if (!agent) {
    return NextResponse.json(
      { data: null, error: { message: 'Agent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  try {
    const supabase = createAdminClient()
    const { runs } = await fetchAgentRecentRuns(supabase, agent.deployName, {
      limit: 1,
      offset: 0,
    })
    const lastRun = runs[0] ?? null

    return NextResponse.json({
      data: { agent, lastRun },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
