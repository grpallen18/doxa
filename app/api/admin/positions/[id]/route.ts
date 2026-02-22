import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns position detail with controversies, viewpoints, claims, and story links. Admin only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing position ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()

    const { data: position, error: posErr } = await supabase
      .from('position_clusters')
      .select('position_cluster_id, label, summary, status, created_at')
      .eq('position_cluster_id', id)
      .single()

    if (posErr || !position) {
      return NextResponse.json(
        { data: null, error: { message: 'Position not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const [controversiesRes, viewpointsRes, claimsRes] = await Promise.all([
      supabase
        .from('controversy_cluster_positions')
        .select('controversy_cluster_id, side, stance_label, controversy_clusters(question, summary, status)')
        .eq('position_cluster_id', id),
      supabase
        .from('controversy_viewpoints')
        .select('viewpoint_id, title, summary, controversy_cluster_id')
        .eq('position_cluster_id', id),
      supabase
        .from('position_cluster_claims')
        .select('claim_id, role, claims(canonical_text, subject, predicate, object)')
        .eq('position_cluster_id', id),
    ])

    const controversies = (controversiesRes.data ?? []).map((row) => {
      const cc = row.controversy_clusters as { question?: string; summary?: string; status?: string } | Array<{ question?: string; summary?: string; status?: string }> | null
      const c = Array.isArray(cc) ? cc[0] : cc
      return {
        controversy_cluster_id: row.controversy_cluster_id,
        side: row.side,
        stance_label: row.stance_label,
        question: c?.question ?? null,
        summary: c?.summary ?? null,
        status: c?.status ?? null,
      }
    })

    const viewpoints = (viewpointsRes.data ?? []).map((row) => ({
      viewpoint_id: row.viewpoint_id,
      title: row.title,
      summary: row.summary,
      controversy_cluster_id: row.controversy_cluster_id,
    }))

    const claimIds = (claimsRes.data ?? []).map((r) => r.claim_id)
    let storyClaims: { claim_id: string; story_id: string; url?: string }[] = []
    if (claimIds.length > 0) {
      const { data: scRows } = await supabase
        .from('story_claims')
        .select('claim_id, story_id, stories(url)')
        .in('claim_id', claimIds)
      storyClaims = (scRows ?? []).map((r) => {
        const stories = r.stories as { url?: string } | Array<{ url?: string }> | null
        const s = Array.isArray(stories) ? stories[0] : stories
        return {
          claim_id: r.claim_id,
          story_id: r.story_id,
          url: s?.url ?? undefined,
        }
      })
    }

    const claims = (claimsRes.data ?? []).map((row) => {
      const rawClaims = row.claims as { canonical_text?: string; subject?: string; predicate?: string; object?: string } | Array<{ canonical_text?: string; subject?: string; predicate?: string; object?: string }> | null
      const c = Array.isArray(rawClaims) ? rawClaims[0] : rawClaims
      const storyLinks = storyClaims.filter((s) => s.claim_id === row.claim_id)
      return {
        claim_id: row.claim_id,
        role: row.role,
        canonical_text: c?.canonical_text ?? null,
        subject: c?.subject ?? null,
        predicate: c?.predicate ?? null,
        object: c?.object ?? null,
        story_links: storyLinks.map((s) => ({ story_id: s.story_id, url: s.url })),
      }
    })

    const topicIds = new Set<string>()
    for (const c of controversies) {
      const { data: tcRows } = await supabase
        .from('topic_controversies')
        .select('topic_id')
        .eq('controversy_cluster_id', c.controversy_cluster_id)
      for (const r of tcRows ?? []) {
        topicIds.add(r.topic_id)
      }
    }
    let topics: { topic_id: string; title: string; slug: string }[] = []
    if (topicIds.size > 0) {
      const { data: topicRows } = await supabase
        .from('topics')
        .select('topic_id, title, slug')
        .in('topic_id', Array.from(topicIds))
      topics = (topicRows ?? []).map((t) => ({
        topic_id: t.topic_id,
        title: t.title ?? 'Untitled',
        slug: t.slug ?? t.topic_id,
      }))
    }

    return NextResponse.json({
      data: {
        ...position,
        controversies,
        viewpoints,
        claims,
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
