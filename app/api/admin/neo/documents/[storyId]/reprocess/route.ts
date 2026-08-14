import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { loadGraphJobStatus } from '@/lib/graph/job-status'
import { clearDocumentGraphCache } from '@/lib/neo4j/document-graph-cache'
import {
  ADMIN_STALE_RUNNING_MINUTES,
  GRAPH_EXTRACTOR_VERSION,
  GRAPH_SCHEMA_VERSION,
} from '@/lib/graph/versions'
import { createAdminClient, formatSupabaseAdminError } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ storyId: string }> }

/**
 * Force-enqueue a graph job for this story (admin reprocess).
 * Always uses force_stale with a short stale window.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'storyId required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    const { data: bodyRow, error: bodyErr } = await supabase
      .from('story_bodies')
      .select('story_id, content_clean')
      .eq('story_id', storyId)
      .maybeSingle()

    if (bodyErr) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(bodyErr.message) } },
        { status: 500 }
      )
    }
    if (!bodyRow?.content_clean) {
      return NextResponse.json(
        {
          data: null,
          error: { message: 'Story has no content_clean; cannot reprocess graph' },
        },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('enqueue_graph_processing_job', {
      p_story_id: storyId,
      p_schema_version: GRAPH_SCHEMA_VERSION,
      p_extractor_version: GRAPH_EXTRACTOR_VERSION,
      p_force_stale: true,
      p_stale_after_minutes: ADMIN_STALE_RUNNING_MINUTES,
    })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(error.message) } },
        { status: 500 }
      )
    }

    const payload =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : null
    if (!payload || payload.ok !== true) {
      return NextResponse.json(
        { data: null, error: { message: 'Unexpected enqueue response' } },
        { status: 500 }
      )
    }

    const status = await loadGraphJobStatus(storyId)
    clearDocumentGraphCache(storyId)

    if (payload.skipped === true) {
      return NextResponse.json({
        data: {
          enqueued: false,
          skipped: true,
          reason: typeof payload.reason === 'string' ? payload.reason : 'running',
          status,
        },
        error: null,
      })
    }

    return NextResponse.json({
      data: {
        enqueued: true,
        skipped: false,
        job_id: typeof payload.job_id === 'string' ? payload.job_id : null,
        status,
      },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reprocess graph'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
