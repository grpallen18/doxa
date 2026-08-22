import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TopicWithDetails, TopicControversy, TopicRelationship } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  try {
    const { id: topicId } = await params

    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('topic_id, slug, title, summary, status, metadata, created_at, updated_at, topic_description')
      .eq('topic_id', topicId)
      .single()

    if (topicError || !topic) {
      return NextResponse.json(
        { data: null, error: { message: 'Topic not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const topicKeyHints = [topic.slug, topic.title].filter(Boolean) as string[]

    let graphQuery = supabase
      .from('graph_controversies')
      .select('uid, title, summary, topic_key, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (topicKeyHints.length === 1) {
      graphQuery = graphQuery.ilike('topic_key', `%${topicKeyHints[0]}%`)
    } else if (topicKeyHints.length > 1) {
      graphQuery = graphQuery.or(
        topicKeyHints.map((h) => `topic_key.ilike.%${h}%`).join(',')
      )
    }

    const [graphCtrRes, relsRes] = await Promise.all([
      graphQuery,
      supabase
        .from('topic_relationships')
        .select('source_topic_id, target_topic_id, similarity_score')
        .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`),
    ])

    const controversies: TopicControversy[] = (graphCtrRes.data ?? []).map((row, i) => ({
      controversy_cluster_id: row.uid as string,
      question: (row.title as string | null) ?? null,
      summary: (row.summary as string | null) ?? null,
      similarity_score: 1,
      rank: i + 1,
    }))

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
      controversies,
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
