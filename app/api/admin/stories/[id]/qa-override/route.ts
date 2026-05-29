import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

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

    const { error: storyErr } = await supabase
      .from('stories')
      .update({
        extraction_qa_status: 'passed',
        extraction_qa_validated_at: now,
      })
      .eq('story_id', storyId)

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
        .eq('story_id', storyId)
    }

    await supabase.from('story_extraction_qa_artifacts').insert({
      story_id: storyId,
      stage: 'human_override',
      report: { approved_by_admin: true, include_chunks: includeChunks },
    })

    return NextResponse.json({ data: { ok: true, story_id: storyId }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
