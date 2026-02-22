import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns controversy detail with positions, viewpoints, and linked topics. Admin only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing controversy ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    const { data: controversy, error: ccErr } = await supabase
      .from('controversy_clusters')
      .select('controversy_cluster_id, question, summary, label, status, created_at')
      .eq('controversy_cluster_id', id)
      .single()

    if (ccErr || !controversy) {
      return NextResponse.json(
        { data: null, error: { message: 'Controversy not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const [positionsRes, viewpointsRes, topicsRes] = await Promise.all([
      supabase
        .from('controversy_cluster_positions')
        .select('position_cluster_id, side, stance_label, position_clusters(label, summary)')
        .eq('controversy_cluster_id', id),
      supabase
        .from('controversy_viewpoints')
        .select('viewpoint_id, title, summary, position_cluster_id')
        .eq('controversy_cluster_id', id),
      supabase
        .from('topic_controversies')
        .select('topic_id, similarity_score, rank, topics(title, slug)')
        .eq('controversy_cluster_id', id)
        .order('rank', { ascending: true }),
    ])

    const positions = (positionsRes.data ?? []).map((row) => {
      const rawPc = row.position_clusters as { label?: string; summary?: string } | Array<{ label?: string; summary?: string }> | null
      const pc = Array.isArray(rawPc) ? rawPc[0] : rawPc
      return {
        position_cluster_id: row.position_cluster_id,
        side: row.side,
        stance_label: row.stance_label,
        label: pc?.label ?? null,
        summary: pc?.summary ?? null,
      }
    })

    const viewpoints = (viewpointsRes.data ?? []).map((row) => ({
      viewpoint_id: row.viewpoint_id,
      title: row.title,
      summary: row.summary,
      position_cluster_id: row.position_cluster_id,
    }))

    const topics = (topicsRes.data ?? []).map((row) => {
      const rawT = row.topics as { title?: string; slug?: string } | Array<{ title?: string; slug?: string }> | null
      const t = Array.isArray(rawT) ? rawT[0] : rawT
      return {
        topic_id: row.topic_id,
        title: t?.title ?? 'Untitled',
        slug: t?.slug ?? row.topic_id,
        similarity_score: Number(row.similarity_score),
        rank: Number(row.rank),
      }
    })

    return NextResponse.json({
      data: {
        ...controversy,
        positions,
        viewpoints,
        topics,
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
