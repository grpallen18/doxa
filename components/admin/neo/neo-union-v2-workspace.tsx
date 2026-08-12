'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import {
  DEFAULT_UNION_V2_FILTERS,
  DEFAULT_UNION_V2_LABEL_VISIBILITY,
  UNION_V2_FA2_SETTINGS,
  type DoxaGraphProjection,
} from '@/lib/admin/neo-graph/types'
import {
  clampUnionStoryLimit,
  UNION_DEFAULT_STORIES,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/union-limits'
import { resolveFocusNodeId } from '@/lib/admin/neo-graph/union-v2-focus'

const NeoProjectionExplorer = dynamic(
  () =>
    import('@/components/admin/neo/projection-explorer').then(
      (m) => m.NeoProjectionExplorer
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#050508] text-sm text-zinc-400">
        Loading Union 2.0…
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
  communityCount?: number
}

export function NeoUnionV2Workspace() {
  const searchParams = useSearchParams()
  const focusParam = searchParams.get('focus')
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
      const res = await fetch('/api/admin/neo/union-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, limit: capped, fresh }),
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setProjection(null)
        setDocuments([])
        setError(json?.error?.message ?? 'Failed to load Union 2.0')
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
      setError('Failed to load Union 2.0')
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
  const focusNodeId = useMemo(
    () =>
      projection
        ? resolveFocusNodeId(
            focusParam,
            projection.nodes.map((n) => n.id)
          )
        : null,
    [focusParam, projection]
  )
  const islandCount = useMemo(
    () =>
      (projection?.communities ?? []).filter(
        (c) => c.kind === 'controversy' || c.kind === 'publication'
      ).length,
    [projection]
  )

  const commitCap = useCallback(
    (opts?: { fresh?: boolean }) => {
      const next = clampUnionStoryLimit(capDraft)
      setCapDraft(String(next))
      const changed = next !== appliedCap
      if (!changed && !opts?.fresh) return
      void loadUnion(next, opts?.fresh ?? true)
    },
    [appliedCap, capDraft, loadUnion]
  )

  const [capFocused, setCapFocused] = useState(false)

  const storyCapControl = (
    <>
      <label htmlFor="union-v2-story-cap" className="sr-only">
        Story cap
      </label>
      <SpotlightBorder
        active={capFocused && !loading}
        className="w-auto bg-white/20 shadow-lg"
      >
        <input
          id="union-v2-story-cap"
          type="number"
          min={1}
          max={UNION_MAX_STORIES}
          inputMode="numeric"
          title={`Story cap (1–${UNION_MAX_STORIES})`}
          value={capDraft}
          disabled={loading}
          onChange={(e) => setCapDraft(e.target.value)}
          onFocus={() => setCapFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitCap({ fresh: true })
            }
          }}
          onBlur={() => {
            setCapFocused(false)
            commitCap()
          }}
          className="relative flex h-8 w-16 rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-black/80 px-2 text-center text-sm font-medium text-zinc-200 outline-none transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </SpotlightBorder>
    </>
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#050508]">
      {loading && !projection ? (
        <p className="p-6 text-sm text-zinc-400">Loading Union 2.0…</p>
      ) : projection && foundCount > 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#050508]/55 backdrop-blur-[1px]">
              <p className="rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-sm text-zinc-300">
                Reloading Union 2.0…
              </p>
            </div>
          ) : null}
          <NeoProjectionExplorer
            projection={projection}
            contextStoryId={contextStoryId}
            defaultFilters={DEFAULT_UNION_V2_FILTERS}
            defaultLabelVisibility={DEFAULT_UNION_V2_LABEL_VISIBILITY}
            layoutMode="ontology-islands"
            colorMode="community"
            clusterMode="spatial"
            fa2Settings={UNION_V2_FA2_SETTINGS}
            variant="galaxy"
            initialFocusNodeId={focusNodeId}
            statsExtra={`${islandCount} communities`}
            canvasOverlay={storyCapControl}
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
