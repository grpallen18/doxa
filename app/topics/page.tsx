import Link from 'next/link'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import { createClient } from '@/lib/supabase/server'

type TopicRow = {
  topic_id: string
  title: string
  slug: string
  status: string
  summary: string | null
  created_at: string
}

async function getTopics(): Promise<TopicRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('topics')
    .select('topic_id, title, slug, status, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data ?? []) as TopicRow[]
}

export default async function TopicsPage() {
  const topics = await getTopics()

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        <section aria-labelledby="topics-heading" className="space-y-4">
          <h1 id="topics-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Browse topics
          </h1>
          <p className="text-sm text-muted">
            Click a topic to read its summary and linked theses.
          </p>
          {topics.length === 0 ? (
            <p className="text-sm text-muted">No topics yet. Create one from the Admin page.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic) => (
                <Link key={topic.topic_id} href={`/page/${topic.topic_id}`}>
                  <Panel variant="soft" className="h-full p-4 transition-colors hover:bg-muted/50">
                    <p className="font-medium text-foreground">{topic.title}</p>
                    {topic.summary && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {topic.summary.length > 120 ? `${topic.summary.slice(0, 120)}…` : topic.summary}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">{topic.status}</p>
                  </Panel>
                </Link>
              ))}
            </div>
          )}
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="hover:text-foreground">
            ← Home
          </Link>
        </footer>
      </div>
    </main>
  )
}
