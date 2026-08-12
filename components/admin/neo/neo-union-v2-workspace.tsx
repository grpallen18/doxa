'use client'

import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'
import { useSearchParams } from 'next/navigation'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import { Button } from '@/components/ui/button'
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
import {
  NEBULA_HEAT_DEFAULT,
  NEBULA_HEAT_MAX,
  NEBULA_HEAT_MIN,
} from '@/lib/admin/neo-graph/appearance'
import {
  NEBULA_RESOLUTION_DEFAULT,
  NEBULA_RESOLUTION_MAX,
  NEBULA_RESOLUTION_MIN,
} from '@/lib/admin/neo-graph/louvain-nebula'
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

function parseHeatDraft(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return NEBULA_HEAT_DEFAULT
  return Math.max(NEBULA_HEAT_MIN, Math.min(NEBULA_HEAT_MAX, parsed))
}

function parseResolutionDraft(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return NEBULA_RESOLUTION_DEFAULT
  return Math.max(
    NEBULA_RESOLUTION_MIN,
    Math.min(NEBULA_RESOLUTION_MAX, parsed)
  )
}

export function NeoUnionV2Workspace() {
  const searchParams = useSearchParams()
  const focusParam = searchParams.get('focus')
  const [capDraft, setCapDraft] = useState(String(UNION_DEFAULT_STORIES))
  const [appliedCap, setAppliedCap] = useState(UNION_DEFAULT_STORIES)
  const [heatDraft, setHeatDraft] = useState(String(NEBULA_HEAT_DEFAULT))
  const [heat, setHeat] = useState(NEBULA_HEAT_DEFAULT)
  const [resolutionDraft, setResolutionDraft] = useState(
    String(NEBULA_RESOLUTION_DEFAULT)
  )
  const [resolution, setResolution] = useState(NEBULA_RESOLUTION_DEFAULT)
  const [projection, setProjection] = useState<DoxaGraphProjection | null>(null)
  const [documents, setDocuments] = useState<UnionDocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capFocused, setCapFocused] = useState(false)
  const [heatFocused, setHeatFocused] = useState(false)
  const [resolutionFocused, setResolutionFocused] = useState(false)

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

  const pendingCap = clampUnionStoryLimit(capDraft)
  const pendingHeat = parseHeatDraft(heatDraft)
  const pendingResolution = parseResolutionDraft(resolutionDraft)
  const paramsDirty =
    pendingCap !== appliedCap ||
    pendingHeat !== heat ||
    pendingResolution !== resolution

  const applyParams = useCallback(() => {
    const nextCap = clampUnionStoryLimit(capDraft)
    const nextHeat = parseHeatDraft(heatDraft)
    const nextResolution = parseResolutionDraft(resolutionDraft)
    setCapDraft(String(nextCap))
    setHeatDraft(String(nextHeat))
    setResolutionDraft(String(nextResolution))
    setHeat(nextHeat)
    setResolution(nextResolution)
    if (nextCap !== appliedCap) {
      void loadUnion(nextCap, true)
    }
  }, [appliedCap, capDraft, heatDraft, loadUnion, resolutionDraft])

  const fieldClassName =
    'relative flex h-8 w-16 rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-black/80 px-2 text-center text-sm font-medium text-zinc-200 outline-none transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

  const onParamKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!paramsDirty || loading) return
    applyParams()
  }

  const storyCapControl = (
    <div className="flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="union-v2-story-cap"
          className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
        >
          depth
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
            title={`Depth — story cap (1–${UNION_MAX_STORIES})`}
            value={capDraft}
            disabled={loading}
            onChange={(e) => setCapDraft(e.target.value)}
            onFocus={() => setCapFocused(true)}
            onBlur={() => setCapFocused(false)}
            onKeyDown={onParamKeyDown}
            className={fieldClassName}
          />
        </SpotlightBorder>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="union-v2-heat"
          className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
        >
          heat
        </label>
        <SpotlightBorder
          active={heatFocused}
          className="w-auto bg-white/20 shadow-lg"
        >
          <input
            id="union-v2-heat"
            type="number"
            min={NEBULA_HEAT_MIN}
            max={NEBULA_HEAT_MAX}
            inputMode="numeric"
            title={`Heat k (1–${NEBULA_HEAT_MAX}) — idle edge alpha = k / √edges`}
            value={heatDraft}
            disabled={loading}
            onChange={(e) => setHeatDraft(e.target.value)}
            onFocus={() => setHeatFocused(true)}
            onBlur={() => setHeatFocused(false)}
            onKeyDown={onParamKeyDown}
            className={fieldClassName}
          />
        </SpotlightBorder>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="union-v2-resolution"
          className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
        >
          resolution
        </label>
        <SpotlightBorder
          active={resolutionFocused}
          className="w-auto bg-white/20 shadow-lg"
        >
          <input
            id="union-v2-resolution"
            type="number"
            min={NEBULA_RESOLUTION_MIN}
            max={NEBULA_RESOLUTION_MAX}
            inputMode="numeric"
            title={`Color clusters (1–${NEBULA_RESOLUTION_MAX}) — maps to 3–8 patches; higher = more colors`}
            value={resolutionDraft}
            disabled={loading}
            onChange={(e) => setResolutionDraft(e.target.value)}
            onFocus={() => setResolutionFocused(true)}
            onBlur={() => setResolutionFocused(false)}
            onKeyDown={onParamKeyDown}
            className={fieldClassName}
          />
        </SpotlightBorder>
      </div>
      <div className="flex flex-col gap-1">
        <span
          aria-hidden
          className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-transparent"
        >
          apply
        </span>
        <Button
          type="button"
          size="sm"
          disabled={!paramsDirty || loading}
          onClick={applyParams}
          className="h-8 bg-white/15 px-3 text-xs text-zinc-100 hover:bg-white/25 disabled:opacity-40"
        >
          Apply
        </Button>
      </div>
    </div>
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
            statsExtra={`${islandCount} ontology`}
            canvasOverlay={storyCapControl}
            nebulaHeat={heat}
            nebulaResolution={resolution}
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
