import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import { AnimatedPanelLink } from '@/components/AnimatedPanelLink'
import { createClient } from '@/lib/supabase/server'
import { Topic } from '@/lib/types'

async function getTopics(): Promise<Topic[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data ?? []) as Topic[]
}

export default async function GraphPage() {
  const topics = await getTopics()

  return (
    <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-8">
        <LandingHeader />

        <Panel variant="soft" className="space-y-4 p-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Topics
          </h1>
          <p className="text-sm text-muted">
            The topic relationship graph is currently unavailable. Browse topics below.
          </p>
        </Panel>

        <div className="grid gap-4 sm:grid-cols-2">
          {topics.length > 0 ? (
            topics.map((topic) => (
              <AnimatedPanelLink
                key={topic.topic_id}
                href={`/page/${topic.topic_id}`}
                className="h-full p-4"
              >
                <p className="text-sm font-medium text-foreground">{topic.title}</p>
                {topic.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{topic.summary}</p>
                )}
              </AnimatedPanelLink>
            ))
          ) : (
            <p className="col-span-2 text-sm text-muted">No published topics yet.</p>
          )}
        </div>
      </div>
    </main>
  )
}
