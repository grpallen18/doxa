import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { listPeople } from '@/lib/explore/person'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { ExploreSearchField } from '@/components/explore/explore-search-field'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { FireRating } from '@/components/explore/fire-rating'
import { Panel } from '@/components/Panel'
import { homePath, peoplePath } from '@/lib/explore-routes'

export const metadata: Metadata = {
  title: 'People — Doxa',
  description: 'People as a way to find debates — not as the debate itself.',
}

export default async function PeopleIndexPage() {
  const supabase = await createClient()
  const people = await listPeople(supabase, 48).catch(() => [])

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-content space-y-6">
        <ExploreBreadcrumbs items={[{ label: 'Debates', href: homePath() }, { label: 'People' }]} />
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Open a person to see the distinct questions they show up in — not one folder of everything
          about them.
        </p>
        <ExploreSearchField className="max-w-xl" />
        {people.length === 0 ? (
          <SparseStatePanel>
            No person profiles projected yet. After debate projection, run{' '}
            <code className="text-xs">project_person_profiles</code>.
          </SparseStatePanel>
        ) : (
          <div className="space-y-3">
            {people.map((p) => (
              <Panel
                key={p.uid}
                as={Link}
                href={peoplePath(p.uid)}
                variant="soft"
                className="flex items-center justify-between gap-3 p-4 no-underline"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.debate_count} debate{p.debate_count === 1 ? '' : 's'}
                  </p>
                </div>
                <FireRating rating={p.fire_rating} />
              </Panel>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
