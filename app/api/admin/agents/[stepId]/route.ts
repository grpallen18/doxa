import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchAgentRecentRuns, getAgentDetail, computeAgentRunStats } from '@/lib/admin/agent-detail'
import {
  fetchAgentProfileOverrides,
  patchAgentProfileFields,
  resolveAgentProfile,
  type AgentProfileField,
} from '@/lib/admin/agent-display-names'

const PROFILE_FIELDS: AgentProfileField[] = ['displayName', 'jobTitle', 'bio']

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
    const [overrides, statsResult, recentResult] = await Promise.all([
      fetchAgentProfileOverrides(supabase, stepId),
      fetchAgentRecentRuns(supabase, agent.deployName, { limit: 50, offset: 0 }),
      fetchAgentRecentRuns(supabase, agent.deployName, { limit: 8, offset: 0 }),
    ])
    const { runs: statsRuns } = statsResult
    const { runs: recentRuns } = recentResult
    const lastRun = statsRuns[0] ?? null
    const runStats = computeAgentRunStats(statsRuns)
    const profile = resolveAgentProfile(agent, overrides)

    return NextResponse.json({
      data: {
        agent,
        lastRun,
        recentRuns,
        runStats,
        ...profile,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  if (!record) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const fieldsToPatch: Partial<Record<AgentProfileField, string | null>> = {}
  for (const field of PROFILE_FIELDS) {
    if (!(field in record)) continue
    const rawValue = record[field]
    if (rawValue !== null && typeof rawValue !== 'string') {
      return NextResponse.json(
        { data: null, error: { message: `${field} must be a string or null` } },
        { status: 400 }
      )
    }
    fieldsToPatch[field] = rawValue as string | null
  }

  if (Object.keys(fieldsToPatch).length === 0) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing displayName, jobTitle, or bio' } },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const result = await patchAgentProfileFields(
    supabase,
    agent,
    fieldsToPatch,
    auth.user.id
  )

  if ('error' in result) {
    return NextResponse.json(
      { data: null, error: { message: result.error } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: result, error: null })
}
