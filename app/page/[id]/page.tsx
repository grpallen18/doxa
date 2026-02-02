import { notFound } from 'next/navigation'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import ViewpointSection from '@/components/topic/ViewpointSection'
import { ViewpointStatisticsCard } from '@/components/topic/ViewpointStatistics'
import { TopicWithDetails, Viewpoint } from '@/lib/types'
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

    const { data: viewpoints } = await supabase
      .from('viewpoints')
      .select('*')
      .eq('topic_id', id)
      .order('title', { ascending: true })

    const topicWithDetails: TopicWithDetails = {
      ...topic,
      viewpoints: (viewpoints || []) as Viewpoint[],
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
              <p>{topic.summary}</p>
            </div>
          )}
        </Panel>

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
