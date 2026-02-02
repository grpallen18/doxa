import { Panel } from '@/components/Panel'
import { PageLink } from '@/components/PageLink'
import { LandingHeader } from '@/components/LandingHeader'

const PLACEHOLDER_RESULTS = [
  { id: '10000000-0000-0000-0000-000000000001', title: 'Are undocumented immigrants eligible for welfare programs?' },
  { id: '10000000-0000-0000-0000-000000000002', title: 'What does CBP mean by an "encounter"?' },
  { id: '10000000-0000-0000-0000-000000000003', title: 'What happened during the Minneapolis ICE protest?' },
  { id: '10000000-0000-0000-0000-000000000004', title: 'How does the U.S. asylum process work?' },
  { id: '10000000-0000-0000-0000-000000000005', title: 'What is the difference between a refugee and an asylee?' },
]

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const query = (q ?? '').trim()

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 md:gap-12">
        <LandingHeader />

        <section aria-labelledby="results-heading" className="space-y-4">
          <h2 id="results-heading" className="text-lg font-semibold tracking-tight text-foreground">
            {query ? `Results for “${query}”` : 'Search results'}
          </h2>
          <p className="text-sm text-muted">
            Placeholder results. A real search API is not yet implemented.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLACEHOLDER_RESULTS.map((item) => (
              <PageLink key={item.id} href={`/page/${item.id}`}>
                <Panel variant="soft" className="h-full p-4">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                </Panel>
              </PageLink>
            ))}
          </div>
        </section>

        <footer className="flex flex-col gap-3 border-t border-subtle pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <a href="/" className="hover:text-foreground">
              ← Home
            </a>
          </div>
        </footer>
      </div>
    </main>
  )
}
