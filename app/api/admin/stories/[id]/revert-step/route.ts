import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import {
  REVERT_SCOPE_STEP_IDS,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'

/** Admin: revert one pipeline step (ingestion through chunk QA). */
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

  let body: { step?: string; confirm?: boolean; chunk_index?: number } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { step?: string; confirm?: boolean; chunk_index?: number }
    }
  } catch {
    body = {}
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { data: null, error: { message: 'Pass { confirm: true } to revert a pipeline step' } },
      { status: 400 }
    )
  }

  const stepInput = body.step?.trim()
  if (!stepInput) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing step id' } },
      { status: 400 }
    )
  }

  if (!REVERT_SCOPE_STEP_IDS.includes(stepInput as PipelineStepId)) {
    return NextResponse.json(
      { data: null, error: { message: `Step cannot be reverted: ${stepInput}` } },
      { status: 400 }
    )
  }

  const stepId = stepInput as PipelineStepId
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
            message: `chunk_index is required for chunk-layer step: ${stepId}. Open the chunk workflow to revert this step.`,
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

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, storyId)
    if ('response' in resolved) return resolved.response
    const { storyUuid } = resolved

    if (chunkIndex != null) {
      const { data, error } = await supabase.rpc('revert_chunk_pipeline_step', {
        p_story_id: storyUuid,
        p_step_id: stepInput,
        p_chunk_index: chunkIndex,
        p_actor_id: auth.user.id,
      })

      if (error) {
        return NextResponse.json(
          { data: null, error: { message: formatSupabaseAdminError(error.message) } },
          { status: 500 }
        )
      }

      return NextResponse.json({ data, error: null })
    }

    const { data, error } = await supabase.rpc('revert_story_pipeline_step', {
      p_story_id: storyUuid,
      p_step_id: stepInput,
      p_actor_id: auth.user.id,
    })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(error.message) } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = formatSupabaseAdminError(extractErrorMessage(error))
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
