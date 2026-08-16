import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listFeaturedTopics, listTrendingControversies } from '@/lib/explore/queries'
import { ExploreSearchField } from '@/components/explore/explore-search-field'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { Panel } from '@/components/Panel'
import { topicHubPath } from '@/lib/explore-routes'
import { DoxaLink } from '@/components/doxa-link'

export const metadata: Metadata = {
  title: 'Explore — Doxa',
  description:
    'Search debates and topics. Controversies are questions — not headlines — with viewpoints side by side.',
}

/**
 * Signed-in explore home. Requires a session (middleware); the marketing
 * landing lives at `/` under the marble layout.
 */
export default async function HomePage() {
  const supabase = await createClient()
  let controversies: Awaited<ReturnType<typeof listTrendingControversies>> = []
  let topics: Awaited<ReturnType<typeof listFeaturedTopics>> = []
  let loadError: string | null = null
  try {
    ;[controversies, topics] = await Promise.all([
      listTrendingControversies(supabase, 12),
      listFeaturedTopics(supabase),
    ])
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load explore data'
  }

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] text-foreground">
      <section className="px-4 pb-12 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-content space-y-6 text-center">
          <p className="text-4xl font-semibold tracking-tight sm:text-5xl">DOXA</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Navigate disagreement without radicalization
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted">
            A structured map of debates from the news — facts at the core, viewpoints side by side,
            evidence you can open.
          </p>
          <ExploreSearchField className="mx-auto max-w-xl" autoFocus />
        </div>
      </section>

      <div className="mx-auto max-w-content space-y-10 px-4 pb-16 sm:px-6 lg:px-8">
        {loadError ? (
          <SparseStatePanel title="Temporarily unavailable">
            <p>{loadError}</p>
            <p className="mt-2">
              If projections are empty, run the debate pipeline and{' '}
              <code className="text-xs">project_debate_summaries</code>, then apply migration 200.
            </p>
          </SparseStatePanel>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Trending controversies
          </h2>
          {controversies.length === 0 ? (
            <SparseStatePanel>
              No controversies are projected yet. Once stories run through graph → debate → project,
              debates will appear here.
            </SparseStatePanel>
          ) : (
            <div className="space-y-3">
              {controversies.map((item) => (
                <ControversyListRow key={item.uid} item={item} />
              ))}
            </div>
          )}
        </section>

        {topics.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Featured topics
            </h2>
            <div className="space-y-3">
              {topics.map((t) => (
                <Panel
                  key={t.slug}
                  as={Link}
                  href={topicHubPath(t.slug)}
                  variant="soft"
                  className="block space-y-1 p-4 no-underline"
                >
                  <p className="text-sm font-medium text-foreground">{t.title}</p>
                  {t.summary ? (
                    <p className="line-clamp-2 text-sm text-muted">{t.summary}</p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {t.controversy_count} linked debate
                    {t.controversy_count === 1 ? '' : 's'}
                  </p>
                </Panel>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            How it works
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Search or browse',
                body: 'Find a debate or topic. Controversies are questions — not headlines.',
              },
              {
                title: 'See how it’s framed',
                body: 'Compare viewpoints side by side, with shared ground and clash made explicit.',
              },
              {
                title: 'Contribute',
                body: 'Save debates and leave structured feedback that improves the model.',
              },
            ].map((step) => (
              <Panel key={step.title} variant="base" className="space-y-2 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {step.title}
                </p>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
              </Panel>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-4 border-t border-border pt-8">
          <DoxaLink href="/about">About</DoxaLink>
        </footer>
      </div>
    </main>
  )
}
