import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Panel } from '@/components/Panel'
import TopicSummary from '@/components/topic/TopicSummary'
import { TopicWithDetails, TopicControversy, TopicRelationship } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

async function getTopic(id: string): Promise<TopicWithDetails | null> {
  const supabase = await createClient()
  try {
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('topic_id, slug, title, summary, status, metadata, created_at, updated_at, topic_description')
      .eq('topic_id', id)
      .single()

    if (topicError || !topic) {
      return null
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
        .or(`source_topic_id.eq.${id},target_topic_id.eq.${id}`),
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
        r.source_topic_id === id ? r.target_topic_id : r.source_topic_id
      )
      .filter((tid: string) => tid !== id)
    const uniqueIds = [...new Set(relatedIds)]

    let relatedTopics: TopicRelationship[] = []
    if (uniqueIds.length > 0) {
      const relsMap = new Map<string, number>()
      for (const r of relsRes.data ?? []) {
        const otherId = (r as { source_topic_id: string; target_topic_id: string }).source_topic_id === id
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

    return topicWithDetails
  } catch {
    return null
  }
}

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const topic = await getTopic(id)

  if (!topic) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-content flex-col gap-8 md:gap-10">
        <Panel as="article" variant="base" className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {topic.title}
          </h1>

          {topic.summary && (
            <div className="space-y-4 text-sm text-foreground">
              <TopicSummary summary={topic.summary} topicId={topic.topic_id} />
            </div>
          )}
        </Panel>

        {topic.controversies && topic.controversies.length > 0 && (
          <section aria-labelledby="debates-heading" className="space-y-4">
            <h2
              id="debates-heading"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              Debates
            </h2>
            <ul className="space-y-2">
              {topic.controversies.map((c) => (
                <li key={c.controversy_cluster_id}>
                  <Panel variant="soft" interactive={false} className="p-3">
                    {c.question ? (
                      <p className="text-sm">{c.question}</p>
                    ) : (
                      <p className="text-sm text-muted">Debate (no question yet)</p>
                    )}
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        )}

        {topic.related_topics && topic.related_topics.length > 0 && (
          <section aria-labelledby="related-heading" className="space-y-4">
            <h2
              id="related-heading"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              Related topics
            </h2>
            <ul className="flex flex-wrap gap-2">
              {topic.related_topics.map((rt) => (
                <li key={rt.target_topic_id}>
                  <Link
                    href={`/page/${rt.target_topic_id}`}
                    className="inline-flex items-center rounded-md border border-input bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    {rt.target_title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

      </div>
    </main>
  )
}
