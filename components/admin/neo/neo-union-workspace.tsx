'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_NEO_FILTERS,
  type DoxaGraphProjection,
} from '@/lib/admin/neo-graph/types'
import {
  clampUnionStoryLimit,
  UNION_DEFAULT_STORIES,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/union-limits'

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
  caps?: { maxStories: number; limit: number }
  storyCount?: number
}

export function NeoUnionWorkspace() {
  const [capDraft, setCapDraft] = useState(String(UNION_DEFAULT_STORIES))
  const [appliedCap, setAppliedCap] = useState(UNION_DEFAULT_STORIES)
  const [projection, setProjection] = useState<DoxaGraphProjection | null>(null)
  const [documents, setDocuments] = useState<UnionDocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUnion = useCallback(async (limit: number, fresh = false) => {
    const capped = clampUnionStoryLimit(limit)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/neo/union', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, limit: capped, fresh }),
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
      setAppliedCap(data.caps?.limit ?? capped)
      setCapDraft(String(data.caps?.limit ?? capped))
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
    void loadUnion(UNION_DEFAULT_STORIES, false)
  }, [loadUnion])

  const foundCount = useMemo(
    () => documents.filter((d) => d.found).length,
    [documents]
  )
  const contextStoryId = useMemo(
    () => documents.find((d) => d.found)?.uid ?? null,
    [documents]
  )

  const refresh = () => {
    const next = clampUnionStoryLimit(capDraft)
    setCapDraft(String(next))
    void loadUnion(next, true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f0f0f]">
      <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#121212] px-3 py-2">
        <label
          htmlFor="union-story-cap"
          className="text-[11px] font-medium uppercase tracking-wide text-zinc-500"
        >
          Story cap
        </label>
        <Input
          id="union-story-cap"
          type="number"
          min={1}
          max={UNION_MAX_STORIES}
          inputMode="numeric"
          value={capDraft}
          disabled={loading}
          onChange={(e) => setCapDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              refresh()
            }
          }}
          className="h-8 w-20 border-white/15 bg-black/40 text-zinc-100"
        />
        <span className="text-[11px] text-zinc-500">
          / {UNION_MAX_STORIES} · newest Neo graphs first
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          className="h-8 gap-1.5 border-white/15 bg-transparent text-zinc-200 hover:bg-white/5"
          onClick={refresh}
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        {!loading && foundCount > 0 ? (
          <span className="ml-auto text-[11px] text-zinc-500">
            Showing {foundCount} of up to {appliedCap} stories
          </span>
        ) : null}
      </div>

      {loading && !projection ? (
        <p className="p-6 text-sm text-zinc-400">Loading all story graphs…</p>
      ) : projection && foundCount > 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#0f0f0f]/55 backdrop-blur-[1px]">
              <p className="rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-sm text-zinc-300">
                Reloading union…
              </p>
            </div>
          ) : null}
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
