import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getAgentDetail } from '@/lib/admin/agent-detail'
import { fetchAgentPrompt } from '@/lib/admin/agent-prompt-store'
import { syncAgentResponseSchemaFromPrompt } from '@/lib/admin/agent-prompt-response-schema'

export async function POST(
  _request: NextRequest,
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

  if (agent.promptKind !== 'llm') {
    return NextResponse.json(
      { data: null, error: { message: 'This agent has no LLM response schema to sync.' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const prompt = await fetchAgentPrompt(supabase, stepId)
    const active = prompt?.slot?.activeVersion
    if (!active) {
      return NextResponse.json(
        { data: null, error: { message: 'No active prompt version to sync from.' } },
        { status: 400 }
      )
    }

    const result = await syncAgentResponseSchemaFromPrompt(supabase, stepId, {
      systemPrompt: active.systemPrompt,
      promptVersionId: active.versionId,
      actorId: auth.user.id,
    })

    if (!result.ok) {
      return NextResponse.json(
        { data: null, error: { message: result.error } },
        { status: 400 }
      )
    }

    return NextResponse.json({
      data: {
        stepId,
        updatedAt: result.updatedAt,
        promptVersionNumber: active.versionNumber,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
