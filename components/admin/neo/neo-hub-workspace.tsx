'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { projectHubGraph } from '@/lib/admin/neo-graph/project-hub'
import { DEFAULT_HUB_FILTERS } from '@/lib/admin/neo-graph/types'
import type { NeoHubGraph, NeoHubRootKind } from '@/lib/neo4j/queries/hub'
import { cn } from '@/lib/utils'

const NeoProjectionExplorer = dynamic(
  () =>
    import('@/components/admin/neo/projection-explorer').then(
      (m) => m.NeoProjectionExplorer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#121212] text-sm text-zinc-400">
        Loading hub explorer…
      </div>
    ),
  }
)

const KIND_API: Record<NeoHubRootKind, string> = {
  controversy: 'controversies',
  proposition: 'propositions',
  entity: 'entities',
}

export function NeoHubWorkspace({
  kind,
  uid,
}: {
  kind: NeoHubRootKind
  uid: string
}) {
  const [hub, setHub] = useState<NeoHubGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeDocUid, setActiveDocUid] = useState<string | null>(null)

  const loadHub = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/neo/hubs/${KIND_API[kind]}/${encodeURIComponent(uid)}`
      )
      const json = await res.json()
      if (!res.ok || json.error) {
        setHub(null)
        setError(json?.error?.message ?? 'Failed to load hub graph')
        return
      }
      const data = json.data as NeoHubGraph
      setHub(data)
      setActiveDocUid(data.documents[0]?.uid ?? null)
    } catch {
      setHub(null)
      setError('Failed to load hub graph')
    } finally {
      setLoading(false)
    }
  }, [kind, uid])

  useEffect(() => {
    void loadHub()
  }, [loadHub])

  const projection = useMemo(
    () => (hub ? projectHubGraph(hub) : null),
    [hub]
  )

  const title =
    hub?.title ||
    hub?.controversy?.title ||
    `${kind} hub`

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f0f0f]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Link href="/admin/neo" className="hover:text-zinc-300 hover:underline">
              Neo
            </Link>
            <span aria-hidden>/</span>
            <span className="capitalize">hub</span>
            <span aria-hidden>/</span>
            <span className="capitalize">{kind}</span>
            {kind === 'controversy' ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/admin/graph-controversies/${encodeURIComponent(uid)}`}
                  className="hover:text-zinc-300 hover:underline"
                >
                  Projection detail
                </Link>
              </>
            ) : null}
          </div>
          <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight text-zinc-100">
            {title}
          </h1>
          {hub ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              {hub.documents.length} documents · {hub.propositions.length} propositions ·{' '}
              {hub.utterances.length} utterances · {hub.viewpoints.length} viewpoints
              {hub.queryTruncated ? ' · query truncated' : ''}
            </p>
          ) : null}
        </div>
      </header>

      {hub && hub.documents.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-white/10 bg-zinc-950/60 px-4 py-2 sm:px-6">
          <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-zinc-500">
            Documents
          </span>
          {hub.documents.map((doc) => (
            <button
              key={doc.uid}
              type="button"
              onClick={() => setActiveDocUid(doc.uid)}
              className={cn(
                'max-w-[14rem] truncate rounded-full border px-2.5 py-1 text-[11px]',
                activeDocUid === doc.uid
                  ? 'border-white/25 bg-white/15 text-zinc-100'
                  : 'border-white/10 bg-transparent text-zinc-400 hover:bg-white/5'
              )}
              title={doc.title || doc.uid}
            >
              {doc.title || `${doc.uid.slice(0, 8)}…`}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="p-6 text-sm text-zinc-400">Loading hub graph…</p>
      ) : error && !hub ? (
        <div className="space-y-3 p-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : projection ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <NeoProjectionExplorer
            projection={projection}
            contextStoryId={activeDocUid}
            defaultFilters={DEFAULT_HUB_FILTERS}
          />
        </div>
      ) : null}
    </div>
  )
}
