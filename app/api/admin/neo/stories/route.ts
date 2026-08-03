import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient, createClient, formatSupabaseAdminError } from '@/lib/supabase/server'

const GRAPH_STATUSES = new Set([
  'pending',
  'running',
  'succeeded',
  'failed',
  'quarantined',
  'cancelled',
])

/** List stories with graph_status for Neo admin. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = await createClient()
    // Jobs table is service-role RLS only — use admin client for error/schema fields.
    const admin = createAdminClient()
    const sp = request.nextUrl.searchParams
    const limit = Math.min(parseInt(sp.get('limit') || '25', 10) || 25, 100)
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0)
    const title = sp.get('title')?.trim() || ''
    const status = sp.get('status')?.trim() || ''

    let query = supabase
      .from('stories')
      .select(
        'story_id, title, url, published_at, graph_status, neo4j_element_id, sources(name)',
        { count: 'exact' }
      )
      .not('graph_status', 'is', null)
      .order('published_at', { ascending: false, nullsFirst: false })

    if (title) {
      query = query.ilike('title', `%${title}%`)
    }
    if (status && GRAPH_STATUSES.has(status)) {
      query = query.eq('graph_status', status)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    const storyIds = (data ?? []).map((row) => row.story_id as string)
    const jobByStory = new Map<
      string,
      {
        status: string
        error: string | null
        finished_at: string | null
        schema_version: string | null
        extractor_version: string | null
      }
    >()

    if (storyIds.length > 0) {
      const { data: jobs, error: jobsError } = await admin
        .from('graph_processing_jobs')
        .select(
          'story_id, status, error, finished_at, created_at, schema_version, extractor_version'
        )
        .in('story_id', storyIds)
        .order('created_at', { ascending: false })

      if (jobsError) {
        return NextResponse.json(
          {
            data: null,
            error: { message: formatSupabaseAdminError(jobsError.message) },
          },
          { status: 500 }
        )
      }

      for (const job of jobs ?? []) {
        const sid = job.story_id as string
        if (!jobByStory.has(sid)) {
          jobByStory.set(sid, {
            status: String(job.status ?? ''),
            error: (job.error as string | null) ?? null,
            finished_at: (job.finished_at as string | null) ?? null,
            schema_version: (job.schema_version as string | null) ?? null,
            extractor_version: (job.extractor_version as string | null) ?? null,
          })
        }
      }
    }

    const items = (data ?? []).map((row) => {
      const sources = row.sources as { name?: string } | { name?: string }[] | null
      const sourceName = Array.isArray(sources)
        ? sources[0]?.name ?? null
        : sources?.name ?? null
      const job = jobByStory.get(row.story_id as string)
      return {
        story_id: row.story_id,
        title: row.title,
        url: row.url,
        published_at: row.published_at,
        source_name: sourceName,
        graph_status: row.graph_status,
        neo4j_element_id: row.neo4j_element_id,
        job_status: job?.status ?? null,
        job_error: job?.error ?? null,
        job_finished_at: job?.finished_at ?? null,
        job_schema_version: job?.schema_version ?? null,
        job_extractor_version: job?.extractor_version ?? null,
      }
    })

    return NextResponse.json({
      data: { items, total: count ?? items.length, limit, offset },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Neo stories'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
