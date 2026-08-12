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
  EMPTY_SELECTION,
  type NeoSelection,
} from '@/lib/admin/neo-graph/neo-selection'
import { NeoNodeDetailPanel } from '@/components/admin/neo/node-detail-panel'
import type { DoxaGraphProjection } from '@/lib/admin/neo-graph/types'
import {
  clampUnionStoryLimit,
  UNION_GRAPH_DEFAULT_STORIES,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/union-limits'
import {
  NEBULA_HEAT_DEFAULT,
  NEBULA_HEAT_MAX,
  NEBULA_HEAT_MIN,
} from '@/lib/admin/neo-graph/appearance'
import {
  NEBULA_BLEND_DEFAULT,
  NEBULA_BLEND_MAX,
  NEBULA_BLEND_MIN,
  NEBULA_RESOLUTION_DEFAULT,
  NEBULA_RESOLUTION_MAX,
  NEBULA_RESOLUTION_MIN,
} from '@/lib/admin/neo-graph/louvain-nebula'
import { resolveFocusNodeId } from '@/lib/admin/neo-graph/union-v2-focus'

const UnionNebula3D = dynamic(
  () =>
    import('@/components/admin/neo/union-nebula-3d').then((m) => m.UnionNebula3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#050508] text-sm text-zinc-400">
        Loading Neo…
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

function parseBlendDraft(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return NEBULA_BLEND_DEFAULT
  return Math.max(NEBULA_BLEND_MIN, Math.min(NEBULA_BLEND_MAX, parsed))
}

export function NeoUnionWorkspace() {
  const searchParams = useSearchParams()
  const focusParam = searchParams.get('focus')
  const [capDraft, setCapDraft] = useState(String(UNION_GRAPH_DEFAULT_STORIES))
  const [appliedCap, setAppliedCap] = useState(UNION_GRAPH_DEFAULT_STORIES)
  const [heatDraft, setHeatDraft] = useState(String(NEBULA_HEAT_DEFAULT))
  const [heat, setHeat] = useState(NEBULA_HEAT_DEFAULT)
  const [resolutionDraft, setResolutionDraft] = useState(
    String(NEBULA_RESOLUTION_DEFAULT)
  )
  const [resolution, setResolution] = useState(NEBULA_RESOLUTION_DEFAULT)
  const [blendDraft, setBlendDraft] = useState(String(NEBULA_BLEND_DEFAULT))
  const [blend, setBlend] = useState(NEBULA_BLEND_DEFAULT)
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [projection, setProjection] = useState<DoxaGraphProjection | null>(null)
  const [documents, setDocuments] = useState<UnionDocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capFocused, setCapFocused] = useState(false)
  const [heatFocused, setHeatFocused] = useState(false)
  const [resolutionFocused, setResolutionFocused] = useState(false)
  const [blendFocused, setBlendFocused] = useState(false)
  const [selection, setSelection] = useState<NeoSelection>(EMPTY_SELECTION)

  const loadUnion = useCallback(async (limit: number, fresh = false) => {
    const capped = clampUnionStoryLimit(limit)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/neo/union', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, limit: capped, fresh }),
        cache: 'no-store',
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setProjection(null)
        setDocuments([])
        setError(json?.error?.message ?? 'Failed to load Neo')
        return
      }
      const data = json.data as UnionApiData
      setProjection(data.projection)
      setDocuments(data.documents)
      setAppliedCap(data.caps?.limit ?? capped)
      setCapDraft(String(data.caps?.limit ?? capped))
      setSelection(EMPTY_SELECTION)
      setLayoutEpoch((e) => e + 1)
      if (data.documents.length === 0) {
        setError('No succeeded stories with Neo graphs yet.')
      } else if (data.missingIds.length > 0) {
        setError(
          `Missing in Neo4j: ${data.missingIds.map((id) => id.slice(0, 8)).join(', ')}…`
        )
      }
    } catch {
      setProjection(null)
      setError('Failed to load Neo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUnion(UNION_GRAPH_DEFAULT_STORIES, false)
  }, [loadUnion])

  const foundCount = useMemo(
    () => documents.filter((d) => d.found).length,
    [documents]
  )
  const contextStoryId = useMemo(
    () => documents.find((d) => d.found)?.uid ?? '',
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

  const pendingCap = clampUnionStoryLimit(capDraft)
  const pendingHeat = parseHeatDraft(heatDraft)
  const pendingResolution = parseResolutionDraft(resolutionDraft)
  const pendingBlend = parseBlendDraft(blendDraft)
  const paramsDirty =
    pendingCap !== appliedCap ||
    pendingHeat !== heat ||
    pendingResolution !== resolution ||
    pendingBlend !== blend

  const applyParams = useCallback(() => {
    const nextCap = clampUnionStoryLimit(capDraft)
    const nextHeat = parseHeatDraft(heatDraft)
    const nextResolution = parseResolutionDraft(resolutionDraft)
    const nextBlend = parseBlendDraft(blendDraft)
    const structuralChanged =
      nextCap !== appliedCap ||
      nextResolution !== resolution ||
      nextBlend !== blend
    setCapDraft(String(nextCap))
    setHeatDraft(String(nextHeat))
    setResolutionDraft(String(nextResolution))
    setBlendDraft(String(nextBlend))
    setHeat(nextHeat)
    setResolution(nextResolution)
    setBlend(nextBlend)
    // Heat-only: update opacity without reseeding / exploding the layout.
    if (structuralChanged) {
      setLayoutEpoch((e) => e + 1)
    }
    if (nextCap !== appliedCap) {
      void loadUnion(nextCap, true)
    }
  }, [
    appliedCap,
    blend,
    blendDraft,
    capDraft,
    heatDraft,
    loadUnion,
    resolution,
    resolutionDraft,
  ])

  const fieldClassName =
    'relative flex h-8 w-16 rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-black/80 px-2 text-center text-sm font-medium text-zinc-200 outline-none transition-colors hover:bg-black/90 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

  const onParamKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!paramsDirty || loading) return
    applyParams()
  }

  const paramField = (
    id: string,
    label: string,
    value: string,
    focused: boolean,
    setFocused: (v: boolean) => void,
    onChange: (v: string) => void,
    opts: {
      min: number
      max: number
      title: string
      spotlightWhenLoading?: boolean
    }
  ) => (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
      >
        {label}
      </label>
      <SpotlightBorder
        active={opts.spotlightWhenLoading ? focused && !loading : focused}
        className="w-auto bg-white/20 shadow-lg"
      >
        <input
          id={id}
          type="number"
          min={opts.min}
          max={opts.max}
          inputMode="numeric"
          title={opts.title}
          value={value}
          disabled={loading}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onParamKeyDown}
          className={fieldClassName}
        />
      </SpotlightBorder>
    </div>
  )

  const controls = (
    <div className="flex flex-col items-start gap-2">
      {paramField(
        'neo-union-story-cap',
        'depth',
        capDraft,
        capFocused,
        setCapFocused,
        setCapDraft,
        {
          min: 1,
          max: UNION_MAX_STORIES,
          title: `Depth — story cap (1–${UNION_MAX_STORIES})`,
          spotlightWhenLoading: true,
        }
      )}
      {paramField(
        'neo-union-heat',
        'heat',
        heatDraft,
        heatFocused,
        setHeatFocused,
        setHeatDraft,
        {
          min: NEBULA_HEAT_MIN,
          max: NEBULA_HEAT_MAX,
          title: `Heat (1–${NEBULA_HEAT_MAX}) — edge tissue brightness`,
        }
      )}
      {paramField(
        'neo-union-resolution',
        'resolution',
        resolutionDraft,
        resolutionFocused,
        setResolutionFocused,
        setResolutionDraft,
        {
          min: NEBULA_RESOLUTION_MIN,
          max: NEBULA_RESOLUTION_MAX,
          title: `Color clusters (1–${NEBULA_RESOLUTION_MAX}) — maps to 3–8 patches`,
        }
      )}
      {paramField(
        'neo-union-blend',
        'blend',
        blendDraft,
        blendFocused,
        setBlendFocused,
        setBlendDraft,
        {
          min: NEBULA_BLEND_MIN,
          max: NEBULA_BLEND_MAX,
          title: `Blend (0–${NEBULA_BLEND_MAX}) — color-zone separation; lower = tighter sphere`,
        }
      )}
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
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#050508]">
      {loading && !projection ? (
        <p className="p-6 text-sm text-zinc-400">Loading Neo…</p>
      ) : projection && foundCount > 0 ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#050508]/55 backdrop-blur-[1px]">
              <p className="rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-sm text-zinc-300">
                Reloading Neo…
              </p>
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <div className="pointer-events-auto absolute left-3 top-3 z-10">
              {controls}
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1">
            <UnionNebula3D
              projection={projection}
              heat={heat}
              resolution={resolution}
              blend={blend}
              layoutEpoch={layoutEpoch}
              initialFocusNodeId={focusNodeId}
              selection={selection}
              onSelectionChange={setSelection}
            />
            {selection.nodeId || selection.edgeId ? (
              <div className="pointer-events-auto absolute bottom-0 right-0 top-0 z-20 w-full max-w-sm">
                <NeoNodeDetailPanel
                  selection={selection}
                  storyId={contextStoryId}
                  onClose={() => setSelection(EMPTY_SELECTION)}
                  onFocus={() => {
                    /* camera focus handled via selection id already in view */
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-sm text-zinc-300">No stories in Neo yet</p>
          <p className="max-w-md text-xs text-zinc-500">
            {error ?? 'Succeeded Neo graphs will appear here automatically.'}
          </p>
        </div>
      )}
    </div>
  )
}
