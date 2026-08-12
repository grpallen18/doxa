import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopicHub } from '@/lib/explore/queries'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { TopicCoreFacts } from '@/components/explore/topic-core-facts'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { AnalyzedCallout } from '@/components/explore/analyzed-callout'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { DoxaLink } from '@/components/doxa-link'
import { TopicHubToc } from '@/components/explore/topic-hub-toc'
import { homePath, topicHubPath } from '@/lib/explore-routes'

type TopicPageProps = {
  params: Promise<{ topicId: string }>
}

function paragraphsFromTopic(summary: string | null, description: string | null): string[] {
  const raw = [summary, description].filter(Boolean).join('\n\n')
  if (!raw.trim()) return []
  return raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4)
}

export default async function TopicHubPage({ params }: TopicPageProps) {
  const { topicId: slug } = await params
  const supabase = await createClient()
  const hub = await getTopicHub(supabase, slug)
  if (!hub) notFound()

  const facts = paragraphsFromTopic(hub.summary, hub.topic_description)

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <TopicHubToc
        title={hub.title}
        hasFacts={facts.length > 0}
        hasAnalyzed={hub.assessments.length > 0}
        hasRelated={hub.related_topics.length > 0}
      />
      <div className="mx-auto max-w-content space-y-8">
        <ExploreBreadcrumbs
          items={[
            { label: 'Explore', href: homePath() },
            { label: hub.title },
          ]}
        />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{hub.title}</h1>
          <p className="text-sm text-muted">
            {hub.controversy_count} controvers
            {hub.controversy_count === 1 ? 'y' : 'ies'}
            {hub.updated_at
              ? ` · Updated ${new Date(hub.updated_at).toLocaleDateString()}`
              : ''}
          </p>
        </header>

        <TopicCoreFacts paragraphs={facts} />

        <section id="controversies" className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Controversies
          </h2>
          {hub.controversies.length === 0 ? (
            <SparseStatePanel>
              This topic hub is published but has no linked debates yet. Controversies appear after
              graph linking passes the density bar.
            </SparseStatePanel>
          ) : (
            hub.controversies.map((c) => (
              <ControversyListRow key={c.uid} item={c} topicSlug={hub.slug} />
            ))
          )}
        </section>

        <AnalyzedCallout assessments={hub.assessments} />

        {hub.related_topics.length > 0 ? (
          <section id="related-topics" className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Related topics
            </h2>
            <ul className="space-y-1">
              {hub.related_topics.map((t) => (
                <li key={t.slug}>
                  <DoxaLink href={topicHubPath(t.slug)}>{t.title}</DoxaLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  )
}
