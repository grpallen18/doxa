import { notFound } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getPersonProfile } from '@/lib/explore/person'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { homePath, peoplePath } from '@/lib/explore-routes'

const PersonEidosCanvas = dynamic(
  () =>
    import('@/components/explore/person-eidos-canvas').then((m) => m.PersonEidosCanvas),
  { ssr: false, loading: () => <p className="text-sm text-muted">Loading Eidos…</p> }
)

type PageProps = {
  params: Promise<{ uid: string }>
}

export default async function PersonEidosPage({ params }: PageProps) {
  const { uid: raw } = await params
  const uid = decodeURIComponent(raw)
  let profile: Awaited<ReturnType<typeof getPersonProfile>> = null
  try {
    profile = await getPersonProfile(uid)
  } catch {
    profile = null
  }
  if (!profile) notFound()

  const hasGraph = profile.eidos.nodes.length > 1

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <ExploreBreadcrumbs
          items={[
            { label: 'Explore', href: homePath() },
            { label: profile.name, href: peoplePath(profile.uid) },
            { label: 'Eidos' },
          ]}
        />
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Eidos</p>
            <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
            <p className="text-sm text-muted">
              A compact map of debates, outlets, and people linked to them in the news graph.
            </p>
          </div>
          <Link
            href={peoplePath(profile.uid)}
            className="rounded-bevel border border-border px-3 py-2 text-sm hover:bg-surface-section"
          >
            Back to profile
          </Link>
        </header>

        {!hasGraph ? (
          <SparseStatePanel title="Eidos not ready">
            Not enough linked graph yet to draw an Eidos for this person.
          </SparseStatePanel>
        ) : (
          <div className="h-[min(70vh,36rem)] overflow-hidden rounded-bevel border border-border bg-surface">
            <PersonEidosCanvas nodes={profile.eidos.nodes} edges={profile.eidos.edges} />
          </div>
        )}
      </div>
    </main>
  )
}
