import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { appendStoryAuditEvent } from '@/lib/admin/story-audit'

/** Admin override: mark story (and optional chunks) extraction QA as passed. */
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

    if (includeChunks) {
      await supabase
        .from('story_chunks')
        .update({
          extraction_qa_status: 'passed',
          extraction_qa_validated_at: now,
        })
        .eq('story_id', storyUuid)
    }

    await supabase.from('story_extraction_qa_artifacts').insert({
      story_id: storyUuid,
      stage: 'human_override',
      report: { approved_by_admin: true, include_chunks: includeChunks },
    })

    await appendStoryAuditEvent(supabase, {
      storyId: storyUuid,
      eventType: 'admin_action',
      label: 'Admin QA override',
      detail: includeChunks ? 'Story and chunks marked passed' : 'Story marked passed',
      actorId: auth.user.id,
      source: 'admin:qa-override',
    })

    return NextResponse.json({ data: { ok: true, story_id: storyUuid }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
