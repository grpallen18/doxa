import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { appendStoryAuditEvent } from '@/lib/admin/story-audit'
import { parseHumanOverrideReport } from '@/lib/admin/qa-override'

/** Undo the latest active human QA override for this story. */
export async function POST(
  _request: NextRequest,
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

  const now = new Date().toISOString()

  try {
    const supabase = createAdminClient()
    const resolved = await resolveStoryIdParam(supabase, storyId)
    if ('response' in resolved) return resolved.response
    const { storyUuid } = resolved

    const { data: artifacts, error: artifactLoadErr } = await supabase
      .from('story_extraction_qa_artifacts')
      .select('id, report, created_at, reverted_at')
      .eq('story_id', storyUuid)
      .eq('stage', 'human_override')
      .is('reverted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (artifactLoadErr) {
      return NextResponse.json(
        { data: null, error: { message: artifactLoadErr.message } },
        { status: 500 }
      )
    }

    const artifact = artifacts?.[0]
    if (!artifact) {
      return NextResponse.json(
        { data: null, error: { message: 'No active human QA override to undo' } },
        { status: 404 }
      )
    }

    const report = parseHumanOverrideReport(artifact.report)
    if (!report) {
      return NextResponse.json(
        { data: null, error: { message: 'Human override artifact is missing undo metadata' } },
        { status: 422 }
      )
    }

    for (const override of report.chunk_overrides ?? []) {
      const { error: chunkErr } = await supabase
        .from('story_chunks')
        .update({
          extraction_qa_status: override.prior_status,
          extraction_qa_validated_at: override.prior_validated_at,
        })
        .eq('story_id', storyUuid)
        .eq('chunk_index', override.chunk_index)

      if (chunkErr) {
        return NextResponse.json(
          { data: null, error: { message: chunkErr.message } },
          { status: 500 }
        )
      }
    }

    if (report.story_qa_overridden) {
      const { error: storyErr } = await supabase
        .from('stories')
        .update({
          extraction_qa_status: report.prior_story_qa_status ?? 'pending',
          extraction_qa_validated_at: report.prior_story_qa_validated_at ?? null,
        })
        .eq('story_id', storyUuid)

      if (storyErr) {
        return NextResponse.json(
          { data: null, error: { message: storyErr.message } },
          { status: 500 }
        )
      }
    } else if (
      !report.chunk_overrides?.length &&
      report.include_chunks !== false
    ) {
      const { data: storyRow, error: storyLoadErr } = await supabase
        .from('stories')
        .select('merged_at, extraction_qa_status')
        .eq('story_id', storyUuid)
        .single()

      if (storyLoadErr) {
        return NextResponse.json(
          { data: null, error: { message: storyLoadErr.message } },
          { status: 500 }
        )
      }

      if (storyRow && !storyRow.merged_at && storyRow.extraction_qa_status === 'passed') {
        const { error: storyErr } = await supabase
          .from('stories')
          .update({
            extraction_qa_status: 'pending',
            extraction_qa_validated_at: null,
          })
          .eq('story_id', storyUuid)

        if (storyErr) {
          return NextResponse.json(
            { data: null, error: { message: storyErr.message } },
            { status: 500 }
          )
        }
      }
    }

    const { error: revertErr } = await supabase
      .from('story_extraction_qa_artifacts')
      .update({ reverted_at: now })
      .eq('id', artifact.id)

    if (revertErr) {
      return NextResponse.json(
        { data: null, error: { message: revertErr.message } },
        { status: 500 }
      )
    }

    await appendStoryAuditEvent(supabase, {
      storyId: storyUuid,
      eventType: 'admin_action',
      label: 'Undo human QA override',
      detail: `Restored ${report.chunk_overrides?.length ?? 0} chunk(s)${
        report.story_qa_overridden ? ' and story merge QA status' : ''
      }`,
      actorId: auth.user.id,
      source: 'admin:qa-override-revert',
    })

    return NextResponse.json({
      data: {
        ok: true,
        story_id: storyUuid,
        restored_chunks: report.chunk_overrides?.length ?? 0,
        restored_story_qa: report.story_qa_overridden === true,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
