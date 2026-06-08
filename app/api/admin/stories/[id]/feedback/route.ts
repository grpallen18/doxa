import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

import { EXTRACTION_ISSUE_TYPES } from '@/lib/admin/extraction-qa-types'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { appendStoryAuditEvent } from '@/lib/admin/story-audit'

const ENTITY_TYPES = ['claim', 'evidence', 'position', 'event', 'relationship'] as const
const RATINGS = ['like', 'dislike'] as const
const PIPELINE_STAGES = ['chunk', 'merge'] as const

/** Record admin QA feedback on an extracted entity or link. Admin only. */
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const entityType = body.entity_type as string
  const rating = body.rating as string

  if (!ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number])) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid entity_type' } },
      { status: 400 }
    )
  }

  if (!RATINGS.includes(rating as (typeof RATINGS)[number])) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid rating' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, storyId)
    if ('response' in resolved) return resolved.response
    const { storyUuid } = resolved

    const issueTypesRaw = body.issue_types
    const issueTypes =
      Array.isArray(issueTypesRaw) &&
      issueTypesRaw.every((t) => typeof t === 'string' && EXTRACTION_ISSUE_TYPES.includes(t as (typeof EXTRACTION_ISSUE_TYPES)[number]))
        ? (issueTypesRaw as string[])
        : null

    const pipelineStage = body.pipeline_stage as string
    const pipelineStageVal =
      pipelineStage && PIPELINE_STAGES.includes(pipelineStage as (typeof PIPELINE_STAGES)[number])
        ? pipelineStage
        : null

    const chunkIndex =
      body.chunk_index !== undefined && body.chunk_index !== null
        ? Number(body.chunk_index)
        : null

    const { data, error } = await supabase
      .from('story_extraction_feedback')
      .insert({
        story_id: storyUuid,
        entity_type: entityType,
        entity_id: (body.entity_id as string) || null,
        relationship_type: (body.relationship_type as string) || null,
        relationship_source_id: (body.relationship_source_id as string) || null,
        relationship_target_id: (body.relationship_target_id as string) || null,
        rating,
        notes: (body.notes as string) || null,
        issue_types: issueTypes,
        pipeline_stage: pipelineStageVal,
        chunk_index: Number.isFinite(chunkIndex) ? chunkIndex : null,
        created_by: auth.user.id,
      })
      .select('id, entity_type, entity_id, rating, notes, issue_types, pipeline_stage, chunk_index, created_at')
      .single()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    await appendStoryAuditEvent(supabase, {
      storyId: storyUuid,
      eventType: 'admin_action',
      label: `Feedback: ${rating}`,
      detail: (body.notes as string) || null,
      meta: {
        entity_type: entityType,
        entity_id: (body.entity_id as string) || null,
        pipeline_stage: pipelineStageVal,
        chunk_index: Number.isFinite(chunkIndex) ? chunkIndex : null,
      },
      actorId: auth.user.id,
      source: 'admin:feedback',
    })

    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
