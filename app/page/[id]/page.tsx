import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import ViewpointSection from '@/components/topic/ViewpointSection'
import TopicSummary from '@/components/topic/TopicSummary'
import { ViewpointStatisticsCard } from '@/components/topic/ViewpointStatistics'
import { TopicWithDetails, Viewpoint, TopicThesis, TopicRelationship } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

async function getTopic(id: string): Promise<TopicWithDetails | null> {
  const supabase = await createClient()
  try {
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('topic_id', id)
      .single()

    if (topicError || !topic) {
      return null
    }

    const [viewpointsRes, topicThesesRes, relsRes] = await Promise.all([
      supabase.from('viewpoints').select('*').eq('topic_id', id).order('title', { ascending: true }),
      supabase
        .from('topic_theses')
        .select('thesis_id, similarity_score, rank, theses(thesis_text)')
        .eq('topic_id', id)
        .order('rank', { ascending: true }),
      supabase
        .from('topic_relationships')
        .select('source_topic_id, target_topic_id, similarity_score')
        .or(`source_topic_id.eq.${id},target_topic_id.eq.${id}`),
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
      viewpoints: (viewpointsRes.data || []) as Viewpoint[],
      theses,
      related_topics: relatedTopics,
    }

    return topicWithDetails
  } catch {
    return null
  }
}

export default async function TopicPage({ params }: { params: { id: string } }) {
  const topic = await getTopic(params.id)

  if (!topic) {
    notFound()
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 md:gap-10">
        <LandingHeader />

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

        {topic.theses && topic.theses.length > 0 && (
          <section aria-labelledby="theses-heading" className="space-y-4">
            <h2
              id="theses-heading"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              Linked theses
            </h2>
            <ul className="space-y-2">
              {topic.theses.map((t) => (
                <li key={t.thesis_id}>
                  <Panel variant="soft" interactive={false} className="p-3">
                    {t.thesis_text ? (
                      <p className="text-sm">{t.thesis_text}</p>
                    ) : (
                      <p className="text-sm text-muted">Thesis (no label yet)</p>
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

        <section aria-labelledby="viewpoints-heading" className="space-y-4">
          <h2
            id="viewpoints-heading"
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            Viewpoints
          </h2>
          {topic.viewpoints && topic.viewpoints.length > 0 ? (
            <div className="flex flex-col gap-4">
              {topic.viewpoints.map((viewpoint, index) => (
                <Panel
                  key={viewpoint.viewpoint_id}
                  variant="soft"
                  interactive={false}
                  className="p-4 md:p-6"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,6fr)_minmax(0,4fr)] md:gap-6 md:items-start">
                    <ViewpointSection viewpoint={viewpoint} embedInPanel />
                    <ViewpointStatisticsCard
                      viewpoint={viewpoint}
                      showHeading={index === 0}
                      embedInPanel
                    />
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No viewpoints available yet.</p>
          )}
        </section>
      </div>
    </main>
  )
}
