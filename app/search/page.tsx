import { createClient } from '@/lib/supabase/server'
import { searchExplore } from '@/lib/explore/queries'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { ExploreSearchField } from '@/components/explore/explore-search-field'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { Panel } from '@/components/Panel'
import Link from 'next/link'
import { homePath, topicHubPath } from '@/lib/explore-routes'

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = '' } = await searchParams
  const query = q.trim()
  const supabase = await createClient()
  const results = query
    ? await searchExplore(supabase, query).catch(() => ({ controversies: [], topics: [] }))
    : { controversies: [], topics: [] }

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-content space-y-6">
        <ExploreBreadcrumbs
          items={[
            { label: 'Explore', href: homePath() },
            { label: 'Search' },
          ]}
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          {query ? `Results for “${query}”` : 'Search'}
        </h1>
        <ExploreSearchField initialQuery={query} />

        {!query ? (
          <SparseStatePanel title="Start searching">
            Enter a term to find controversies and published topic hubs.
          </SparseStatePanel>
        ) : (
          <>
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
