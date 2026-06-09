import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getAgentDetail } from '@/lib/admin/agent-detail'
import { activateAgentPromptVersion } from '@/lib/admin/agent-prompt-store'
import { detectPromptSchemaMismatchForSave } from '@/lib/admin/agent-prompt-response-schema'

export async function POST(
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

  let body: { versionId?: string } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  if (!body.versionId) {
    return NextResponse.json(
      { data: null, error: { message: 'versionId is required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const result = await activateAgentPromptVersion(supabase, stepId, {
      versionId: body.versionId,
      actorId: auth.user.id,
    })

    if ('error' in result) {
      return NextResponse.json(
        { data: null, error: { message: result.error } },
        { status: result.status }
      )
    }

    const { data: version } = await supabase
      .from('agent_prompt_versions')
      .select('system_prompt')
      .eq('version_id', body.versionId)
      .maybeSingle()

    const schemaMismatch = version?.system_prompt
      ? await detectPromptSchemaMismatchForSave(
          supabase,
          stepId,
          version.system_prompt as string
        )
      : null

    return NextResponse.json({
      data: {
        ...result,
        schemaMismatch,
        canSyncSchema: schemaMismatch?.mismatched === true,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
