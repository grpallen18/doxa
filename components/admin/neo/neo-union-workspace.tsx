'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_NEO_FILTERS,
  type DoxaGraphProjection,
} from '@/lib/admin/neo-graph/types'

const NeoProjectionExplorer = dynamic(
  () =>
    import('@/components/admin/neo/projection-explorer').then(
      (m) => m.NeoProjectionExplorer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#121212] text-sm text-zinc-400">
        Loading union explorer…
      </div>
    ),
  }
)

type UnionDocMeta = {
  uid: string
  title: string | null
  found: boolean
}

type UnionApiData = {
  projection: DoxaGraphProjection
  documents: UnionDocMeta[]
  missingIds: string[]
}

export function NeoUnionWorkspace() {
  const [projection, setProjection] = useState<DoxaGraphProjection | null>(null)
  const [documents, setDocuments] = useState<UnionDocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUnion = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/neo/union', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setProjection(null)
        setDocuments([])
        setError(json?.error?.message ?? 'Failed to load union graph')
        return
      }
      const data = json.data as UnionApiData
      setProjection(data.projection)
      setDocuments(data.documents)
      if (data.documents.length === 0) {
        setError('No succeeded stories with Neo graphs yet.')
      } else if (data.missingIds.length > 0) {
        setError(
          `Missing in Neo4j: ${data.missingIds.map((id) => id.slice(0, 8)).join(', ')}…`
        )
      }
    } catch {
      setProjection(null)
      setError('Failed to load union graph')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUnion()
  }, [loadUnion])

  const foundCount = useMemo(
    () => documents.filter((d) => d.found).length,
    [documents]
  )
  const contextStoryId = useMemo(
    () => documents.find((d) => d.found)?.uid ?? null,
    [documents]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f0f0f]">
      {loading && !projection ? (
        <p className="p-6 text-sm text-zinc-400">Loading all story graphs…</p>
      ) : projection && foundCount > 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <NeoProjectionExplorer
            projection={projection}
            contextStoryId={contextStoryId}
            defaultFilters={DEFAULT_NEO_FILTERS}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-sm text-zinc-300">No stories to union yet</p>
          <p className="max-w-md text-xs text-zinc-500">
            {error ?? 'Succeeded Neo graphs will appear here automatically.'}
          </p>
        </div>
      )}
    </div>
  )
}
