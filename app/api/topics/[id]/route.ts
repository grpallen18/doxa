import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { TopicWithDetails, TopicThesis, TopicRelationship } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const topicId = params.id

    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('topic_id', topicId)
      .single()

    if (topicError || !topic) {
      return NextResponse.json(
        { data: null, error: { message: 'Topic not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const [viewpointsRes, topicThesesRes, relsRes] = await Promise.all([
      supabase.from('viewpoints').select('*').eq('topic_id', topicId).order('title', { ascending: true }),
      supabase
        .from('topic_theses')
        .select('thesis_id, similarity_score, rank, theses(thesis_text)')
        .eq('topic_id', topicId)
        .order('rank', { ascending: true }),
      supabase
        .from('topic_relationships')
        .select('source_topic_id, target_topic_id, similarity_score')
        .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`),
    ])

    const theses: TopicThesis[] = (topicThesesRes.data ?? []).map((row: Record<string, unknown>) => {
      const t = row.theses as { thesis_text?: string | null } | null | undefined
      return {
        thesis_id: row.thesis_id as string,
        thesis_text: (Array.isArray(t) ? t[0]?.thesis_text : t?.thesis_text) ?? null,
        similarity_score: Number(row.similarity_score),
        rank: Number(row.rank),
      }
    })

    const relatedIds = (relsRes.data ?? [])
      .map((r: { source_topic_id: string; target_topic_id: string }) =>
        r.source_topic_id === topicId ? r.target_topic_id : r.source_topic_id
      )
      .filter((tid: string) => tid !== topicId)
    const uniqueIds = [...new Set(relatedIds)]

    let relatedTopics: TopicRelationship[] = []
    if (uniqueIds.length > 0) {
      const relsMap = new Map<string, number>()
      for (const r of relsRes.data ?? []) {
        const otherId = (r as { source_topic_id: string; target_topic_id: string }).source_topic_id === topicId
          ? (r as { target_topic_id: string }).target_topic_id
          : (r as { source_topic_id: string }).source_topic_id
        const score = (r as { similarity_score: number }).similarity_score
        if (!relsMap.has(otherId) || (relsMap.get(otherId) ?? 0) < score) {
          relsMap.set(otherId, score)
        }
      }
      const { data: topicRows } = await supabase
        .from('topics')
        .select('topic_id, title, slug')
        .in('topic_id', uniqueIds)
      const topicMap = new Map((topicRows ?? []).map((t: { topic_id: string; title: string; slug: string }) => [t.topic_id, t]))
      relatedTopics = uniqueIds
        .map((tid) => ({
          target_topic_id: tid,
          target_title: topicMap.get(tid)?.title ?? 'Untitled',
          target_slug: topicMap.get(tid)?.slug ?? tid,
          similarity_score: relsMap.get(tid) ?? 0,
        }))
        .sort((a, b) => b.similarity_score - a.similarity_score)
    }

    const topicWithDetails: TopicWithDetails = {
      ...topic,
      viewpoints: viewpointsRes.data || [],
      theses,
      related_topics: relatedTopics,
    }

    return NextResponse.json({ data: topicWithDetails, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const topicId = params.id
  if (!topicId) {
    return NextResponse.json(
      { data: null, error: { message: 'Topic ID required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('topics').delete().eq('topic_id', topicId)

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { deleted: true }, error: null })
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
