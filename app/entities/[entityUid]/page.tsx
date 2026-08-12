import { notFound } from 'next/navigation'
import { getEntityDossier } from '@/lib/explore/entity'
import { ExploreBreadcrumbs } from '@/components/explore/explore-breadcrumbs'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { Panel } from '@/components/Panel'
import { DoxaLink } from '@/components/doxa-link'
import { controversyPath, homePath } from '@/lib/explore-routes'

type PageProps = {
  params: Promise<{ entityUid: string }>
}

export default async function EntityPage({ params }: PageProps) {
  const { entityUid } = await params
  const uid = decodeURIComponent(entityUid)
  let dossier: Awaited<ReturnType<typeof getEntityDossier>> = null
  try {
    dossier = await getEntityDossier(uid)
  } catch {
    dossier = null
  }
  if (!dossier) notFound()

  return (
    <main className="min-h-[calc(100svh-var(--header-height))] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-content space-y-8">
        <ExploreBreadcrumbs
          items={[
            { label: 'Explore', href: homePath() },
            { label: dossier.name },
          ]}
        />
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Entity</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{dossier.name}</h1>
          {dossier.kind ? <p className="text-sm text-muted">{dossier.kind}</p> : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Controversies
          </h2>
          {dossier.controversies.length === 0 ? (
            <SparseStatePanel>
              No linked controversies projected for this entity yet.
            </SparseStatePanel>
          ) : (
            dossier.controversies.map((c) => <ControversyListRow key={c.uid} item={c} />)
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Propositions
          </h2>
          {dossier.propositions.length === 0 ? (
            <SparseStatePanel>No propositions mention this entity in the graph yet.</SparseStatePanel>
          ) : (
            <div className="space-y-2">
              {dossier.propositions.map((p) => (
                <Panel key={p.uid} variant="soft" interactive={false} className="space-y-2 p-4">
                  <p className="text-sm leading-relaxed text-foreground">{p.text}</p>
                  {p.controversy_uid ? (
                    <DoxaLink href={controversyPath(p.controversy_uid)}>Open debate</DoxaLink>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
