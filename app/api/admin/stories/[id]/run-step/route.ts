import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { extractEdgeFunctionError, extractErrorMessage } from '@/lib/admin/story-extraction-review'
import { createAdminClient } from '@/lib/supabase/server'
import {
  PIPELINE_STEPS,
  getInvokeOptions,
  resolveDeployName,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { appendAdminStoryStepRunFailure } from '@/lib/admin/story-step-runs'
import { fetchAgentPrompt } from '@/lib/admin/agent-prompt-store'
import { checkAgentPromptSchemaMatch } from '@/lib/admin/agent-prompt-response-schema'
import type { PipelineWarning } from '@/lib/admin/pipeline-warnings'
import { edgeFunctionHeaders } from '@/lib/supabase/edge-function-auth'
import { isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'

/** Admin: invoke one pipeline edge function for a story (optional single chunk). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id: storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing story ID' } },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { data: null, error: { message: 'Server not configured for Edge Function calls' } },
      { status: 503 }
    )
  }

  let body: { step?: string; chunk_index?: number } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { step?: string; chunk_index?: number }
    }
  } catch {
    body = {}
  }

  const stepInput = body.step?.trim()
  if (!stepInput) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing step (deploy name or step id)' } },
      { status: 400 }
    )
  }

  const deployName = resolveDeployName(stepInput)
  if (!deployName) {
    return NextResponse.json(
      { data: null, error: { message: `Unknown pipeline step: ${stepInput}` } },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const resolved = await resolveStoryIdParam(supabase, storyId)
  if ('response' in resolved) return resolved.response
  const { storyUuid } = resolved

  const stepDef = PIPELINE_STEPS.find((step) => step.deployName === deployName)
  const stepId = (stepDef?.id ?? stepInput) as PipelineStepId

  const chunkIndex =
    body.chunk_index !== undefined && body.chunk_index !== null
      ? Number(body.chunk_index)
      : null

  if (isChunkParallelStep(stepId)) {
    if (chunkIndex == null || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `chunk_index is required for chunk-layer step: ${stepId}. Open the chunk workflow to run this step.`,
          },
        },
        { status: 400 }
      )
    }
  } else if (chunkIndex != null) {
    return NextResponse.json(
      { data: null, error: { message: 'chunk_index is only valid for chunk-layer steps' } },
      { status: 400 }
    )
  }

  const invokeOptions = getInvokeOptions(deployName)
  const invokeBody: Record<string, unknown> = { story_id: storyUuid }
  if (invokeOptions.usesMaxChunks && invokeOptions.maxChunks != null) {
    invokeBody.max_chunks = invokeOptions.maxChunks
  }
  if (chunkIndex != null) {
    invokeBody.chunk_index = chunkIndex
  }

  const warnings: PipelineWarning[] = []
  let promptVersionNumber: number | null = null

  if (stepDef?.promptKind === 'llm' && stepDef.id) {
    const promptView = await fetchAgentPrompt(supabase, stepDef.id)
    const activePrompt = promptView?.slot?.activeVersion
    if (activePrompt) {
      promptVersionNumber = activePrompt.versionNumber
      const mismatch = await checkAgentPromptSchemaMatch(
        supabase,
        stepDef.id,
        activePrompt.systemPrompt
      )
      if (mismatch?.message) {
        warnings.push({
          kind: 'prompt_schema_mismatch',
          message: mismatch.message,
          stepId: stepDef.id,
          canSyncSchema: true,
        })
      }
    }
  }

  const edgeTimeoutMs = invokeOptions.timeoutMs

  try {
    await supabase.rpc('stage_story_audit_actor', {
      p_story_id: storyUuid,
      p_actor_id: auth.user.id,
    })

    const url = `${supabaseUrl}/functions/v1/${deployName}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...edgeFunctionHeaders(serviceKey),
      },
      body: JSON.stringify(invokeBody),
      signal: AbortSignal.timeout(edgeTimeoutMs),
    })

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const debugTrace = data.debug_trace
    const chunkDebugTrace = data.chunk_debug_trace
    if (!res.ok) {
      const message = extractEdgeFunctionError(data, res.status)
      const errorCode = typeof data.error_code === 'string' ? data.error_code : undefined
      if (res.status >= 500 || res.status === 422) {
        try {
          await appendAdminStoryStepRunFailure(supabase, {
            storyId: storyUuid,
            stepId: stepDef?.id ?? stepInput,
            deployName,
            actorId: auth.user.id,
            error: message,
            chunkIndex,
            meta: {
              http_status: res.status,
              edge_result: data,
              ...(errorCode ? { error_code: errorCode } : {}),
              ...(debugTrace ? { debug_trace: debugTrace } : {}),
              ...(chunkDebugTrace ? { chunk_debug_trace: chunkDebugTrace } : {}),
              ...(chunkIndex != null ? { chunk_index: chunkIndex } : {}),
            },
          })
        } catch (stepRunError: unknown) {
          console.error('[run-step] Failed to append story step run failure:', stepRunError)
        }
      }
      return NextResponse.json(
        {
          data: null,
          error: {
            message,
            deploy_name: deployName,
            ...(errorCode ? { error_code: errorCode } : {}),
            ...(debugTrace ? { debug_trace: debugTrace } : {}),
            ...(chunkDebugTrace ? { chunk_debug_trace: chunkDebugTrace } : {}),
          },
        },
        { status: res.status >= 500 ? 502 : res.status }
      )
    }

    const resultPromptVersion =
      typeof data.prompt_version_number === 'number' ? data.prompt_version_number : promptVersionNumber
    return NextResponse.json({
      data: {
        deploy_name: deployName,
        result: data,
        prompt_version_number: resultPromptVersion,
        chunk_index: chunkIndex,
        warnings,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = extractErrorMessage(error)
    try {
      await appendAdminStoryStepRunFailure(supabase, {
        storyId: storyUuid,
        stepId: stepDef?.id ?? stepInput,
        deployName,
        actorId: auth.user.id,
        error: message,
        chunkIndex,
        meta: {
          source: 'run-step_exception',
          ...(chunkIndex != null ? { chunk_index: chunkIndex } : {}),
        },
      })
    } catch (stepRunError: unknown) {
      console.error('[run-step] Failed to append story step run failure:', stepRunError)
    }
    return NextResponse.json(
      { data: null, error: { message, deploy_name: deployName } },
      { status: 502 }
    )
  } finally {
    try {
      await supabase.rpc('clear_story_audit_actor', { p_story_id: storyUuid })
    } catch (clearError: unknown) {
      console.error('[run-step] Failed to clear staged audit actor:', clearError)
    }
  }
}
