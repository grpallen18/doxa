import { createClient } from '@/lib/supabase/server'
import { searchExplore } from '@/lib/explore/queries'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { ExploreSearchField } from '@/components/explore/explore-search-field'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { FireRating } from '@/components/explore/fire-rating'
import { Panel } from '@/components/Panel'
import Link from 'next/link'
import { homePath, peoplePath, topicHubPath } from '@/lib/explore-routes'

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = '' } = await searchParams
  const query = q.trim()
  const supabase = await createClient()
  const results = query
    ? await searchExplore(supabase, query).catch(() => ({
        controversies: [],
        topics: [],
        people: [],
      }))
    : { controversies: [], topics: [], people: [] }

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-content space-y-6">
        <ExploreBreadcrumbs
          items={[
            { label: 'Debates', href: homePath() },
            { label: 'Search' },
          ]}
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          {query ? `Results for “${query}”` : 'Search'}
        </h1>
        <ExploreSearchField initialQuery={query} />

        {!query ? (
          <SparseStatePanel title="Start searching">
            Enter a term to find people, debates, and published topic hubs.
          </SparseStatePanel>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                People
              </h2>
              {results.people.length === 0 ? (
                <p className="text-sm text-muted">No people matched.</p>
              ) : (
                results.people.map((p) => (
                  <Panel
                    key={p.uid}
                    as={Link}
                    href={peoplePath(p.uid)}
                    variant="soft"
                    className="flex items-center justify-between gap-3 p-4 no-underline"
                  >
                    <div className="min-w-0 space-y-1">
                      <span className="rounded-md bg-surface-section px-2 py-0.5 text-xs text-muted">
                        Person
                      </span>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted">
                        {p.debate_count} debate{p.debate_count === 1 ? '' : 's'}
                      </p>
                    </div>
                    <FireRating rating={p.fire_rating} />
                  </Panel>
                ))
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Controversies
              </h2>
              {results.controversies.length === 0 ? (
                <p className="text-sm text-muted">No debates matched.</p>
              ) : (
                results.controversies.map((item) => (
                  <ControversyListRow key={item.uid} item={item} />
                ))
              )}
            </section>
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Topics
              </h2>
              {results.topics.length === 0 ? (
                <p className="text-sm text-muted">No topic hubs matched.</p>
              ) : (
                results.topics.map((t) => (
                  <Panel
                    key={t.slug}
                    as={Link}
                    href={topicHubPath(t.slug)}
                    variant="soft"
                    className="block space-y-1 p-4 no-underline"
                  >
                    <span className="rounded-md bg-surface-section px-2 py-0.5 text-xs text-muted">
                      Topic
                    </span>
                    <p className="text-sm font-medium text-foreground">{t.title}</p>
                    {t.summary ? (
                      <p className="line-clamp-2 text-sm text-muted">{t.summary}</p>
                    ) : null}
                  </Panel>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
