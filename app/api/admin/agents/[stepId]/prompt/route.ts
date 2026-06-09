import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { getAgentDetail } from '@/lib/admin/agent-detail'
import {
  createAgentPromptVersion,
  fetchAgentPrompt,
  fetchVersionPrompt,
} from '@/lib/admin/agent-prompt-store'
import {
  checkPromptOutputSchemaMatchWithSpec,
  detectPromptSchemaMismatchForSave,
  fetchAgentResponseSchemaState,
  getEffectiveEnforcedSpec,
} from '@/lib/admin/agent-prompt-response-schema'

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

  const versionId = request.nextUrl.searchParams.get('versionId')

  try {
    const supabase = createAdminClient()

    if (versionId) {
      const version = await fetchVersionPrompt(supabase, stepId, versionId)
      if (!version) {
        return NextResponse.json(
          { data: null, error: { message: 'Version not found' } },
          { status: 404 }
        )
      }
      return NextResponse.json({
        data: {
          versionId,
          versionNumber: version.versionNumber,
          systemPrompt: version.systemPrompt,
        },
        error: null,
      })
    }

    const prompt = await fetchAgentPrompt(supabase, stepId)
    if (!prompt) {
      return NextResponse.json(
        { data: null, error: { message: 'Agent not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const schemaState = await fetchAgentResponseSchemaState(supabase, stepId)
    const activePrompt = prompt.slot?.activeVersion?.systemPrompt
    const schemaMismatch = activePrompt
      ? checkPromptOutputSchemaMatchWithSpec(
          activePrompt,
          getEffectiveEnforcedSpec(stepId, schemaState)
        )
      : null

    return NextResponse.json({
      data: {
        ...prompt,
        responseSchema: {
          hasOverride: schemaState.hasOverride,
          updatedAt: schemaState.updatedAt,
          promptVersionId: schemaState.promptVersionId,
        },
        schemaMismatch,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

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

  let body: { systemPrompt?: string; changeNote?: string; activate?: boolean } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  if (typeof body.systemPrompt !== 'string') {
    return NextResponse.json(
      { data: null, error: { message: 'systemPrompt is required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const result = await createAgentPromptVersion(supabase, stepId, {
      systemPrompt: body.systemPrompt,
      changeNote: body.changeNote,
      activate: body.activate,
      actorId: auth.user.id,
    })

    if ('error' in result) {
      return NextResponse.json(
        { data: null, error: { message: result.error } },
        { status: result.status }
      )
    }

    const schemaMismatch = await detectPromptSchemaMismatchForSave(
      supabase,
      stepId,
      body.systemPrompt
    )

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
