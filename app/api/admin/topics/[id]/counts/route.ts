import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Controversy / viewpoint counts from Neo projections for a topic. Admin only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id: topicId } = await params
  if (!topicId) {
    return NextResponse.json(
      { data: null, error: { message: 'Topic ID required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const { data: topic } = await supabase
      .from('topics')
      .select('slug, title')
      .eq('topic_id', topicId)
      .maybeSingle()

    const hints = [topic?.slug, topic?.title].filter(Boolean) as string[]
    const { data: rows } = await supabase
      .from('graph_controversies')
      .select('uid, topic_key')
      .limit(200)

    const matched = (rows ?? []).filter((row) => {
      const key = (row.topic_key as string | null)?.toLowerCase() ?? ''
      if (!key) return false
      return hints.some((h) => key.includes(String(h).toLowerCase()))
    })
    const uids = matched.map((r) => r.uid as string)
    const controversy_count = uids.length

    let viewpoint_count = 0
    if (uids.length > 0) {
      const { count } = await supabase
        .from('graph_viewpoints')
        .select('uid', { count: 'exact', head: true })
        .in('controversy_uid', uids)
      viewpoint_count = count ?? 0
    }

    return NextResponse.json({
      data: {
        controversy_count,
        position_count: viewpoint_count,
        viewpoint_count,
      },
      error: null,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
