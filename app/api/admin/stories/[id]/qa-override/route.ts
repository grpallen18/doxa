import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { appendStoryAuditEvent } from '@/lib/admin/story-audit'
import {
  type ChunkOverrideRecord,
  type QaOverrideScope,
  parseQaOverrideScope,
} from '@/lib/admin/qa-override'

type StoryQaRow = {
  merged_at: string | null
  extraction_qa_status: string | null
  extraction_qa_validated_at: string | null
}

async function inferScopeFromDb(
  supabase: ReturnType<typeof createAdminClient>,
  storyUuid: string,
  story: StoryQaRow
): Promise<QaOverrideScope> {
  const chunkHuman =
    (
      await supabase
        .from('story_chunks')
        .select('chunk_index')
        .eq('story_id', storyUuid)
        .eq('extraction_qa_status', 'needs_human_review')
        .limit(1)
    ).data?.length ?? 0

  const mergeHuman = story.extraction_qa_status === 'needs_human_review'
  if (chunkHuman > 0 && !mergeHuman && story.merged_at == null) return 'chunks'
  if (mergeHuman && story.merged_at != null) return 'merge'
  if (chunkHuman > 0) return 'chunks'
  return 'both'
}

/** Admin override: mark chunk and/or merge extraction QA as passed. */
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

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const includeChunks = body.include_chunks !== false
  const now = new Date().toISOString()

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, storyId)
    if ('response' in resolved) return resolved.response
    const { storyUuid } = resolved

    const { data: story, error: storyLoadErr } = await supabase
      .from('stories')
      .select('merged_at, extraction_qa_status, extraction_qa_validated_at')
      .eq('story_id', storyUuid)
      .single()

    if (storyLoadErr || !story) {
      return NextResponse.json(
        { data: null, error: { message: storyLoadErr?.message ?? 'Story not found' } },
        { status: 500 }
      )
    }

    const scope =
      parseQaOverrideScope(body.scope) ??
      (await inferScopeFromDb(supabase, storyUuid, story as StoryQaRow))

    const chunkOverrides: ChunkOverrideRecord[] = []
    let storyQaOverridden = false
    let priorStoryQaStatus: string | null = null
    let priorStoryQaValidatedAt: string | null = null

    if ((scope === 'chunks' || scope === 'both') && includeChunks) {
      const { data: humanChunks, error: chunkLoadErr } = await supabase
        .from('story_chunks')
        .select('chunk_index, extraction_qa_status, extraction_qa_validated_at')
        .eq('story_id', storyUuid)
        .eq('extraction_qa_status', 'needs_human_review')

      if (chunkLoadErr) {
        return NextResponse.json(
          { data: null, error: { message: chunkLoadErr.message } },
          { status: 500 }
        )
      }

      for (const chunk of humanChunks ?? []) {
        chunkOverrides.push({
          chunk_index: chunk.chunk_index,
          prior_status: chunk.extraction_qa_status,
          prior_validated_at: chunk.extraction_qa_validated_at,
        })
      }

      if (chunkOverrides.length > 0) {
        const { error: chunkUpdateErr } = await supabase
          .from('story_chunks')
          .update({
            extraction_qa_status: 'passed',
            extraction_qa_validated_at: now,
          })
          .eq('story_id', storyUuid)
          .eq('extraction_qa_status', 'needs_human_review')

        if (chunkUpdateErr) {
          return NextResponse.json(
            { data: null, error: { message: chunkUpdateErr.message } },
            { status: 500 }
          )
        }
      } else if (scope === 'both') {
        const { error: allChunksErr } = await supabase
          .from('story_chunks')
          .update({
            extraction_qa_status: 'passed',
            extraction_qa_validated_at: now,
          })
          .eq('story_id', storyUuid)

        if (allChunksErr) {
          return NextResponse.json(
            { data: null, error: { message: allChunksErr.message } },
            { status: 500 }
          )
        }
      }
    }

    if (scope === 'merge' || scope === 'both') {
      priorStoryQaStatus = story.extraction_qa_status
      priorStoryQaValidatedAt = story.extraction_qa_validated_at
      storyQaOverridden = true

      const { error: storyErr } = await supabase
        .from('stories')
        .update({
          extraction_qa_status: 'passed',
          extraction_qa_validated_at: now,
        })
        .eq('story_id', storyUuid)

      if (storyErr) {
        return NextResponse.json(
          { data: null, error: { message: storyErr.message } },
          { status: 500 }
        )
      }

      if (includeChunks && scope === 'merge') {
        await supabase
          .from('story_chunks')
          .update({
            extraction_qa_status: 'passed',
            extraction_qa_validated_at: now,
          })
          .eq('story_id', storyUuid)
      }
    }

    const { error: artifactErr } = await supabase.from('story_extraction_qa_artifacts').insert({
      story_id: storyUuid,
      stage: 'human_override',
      report: {
        approved_by_admin: true,
        scope,
        include_chunks: includeChunks,
        story_qa_overridden: storyQaOverridden,
        prior_story_qa_status: priorStoryQaStatus,
        prior_story_qa_validated_at: priorStoryQaValidatedAt,
        chunk_overrides: chunkOverrides,
      },
    })

    if (artifactErr) {
      return NextResponse.json(
        { data: null, error: { message: artifactErr.message } },
        { status: 500 }
      )
    }

    const detail =
      scope === 'chunks'
        ? `Chunk QA override (${chunkOverrides.length} chunk(s) marked passed)`
        : scope === 'merge'
          ? 'Merge QA override (story marked passed)'
          : includeChunks
            ? 'Story and chunks marked passed'
            : 'Story marked passed'

    await appendStoryAuditEvent(supabase, {
      storyId: storyUuid,
      eventType: 'admin_action',
      label: 'Admin QA override',
      detail,
      actorId: auth.user.id,
      source: 'admin:qa-override',
    })

    return NextResponse.json({
      data: { ok: true, story_id: storyUuid, scope, chunk_overrides: chunkOverrides.length },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
