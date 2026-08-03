'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NeoSigmaCanvas, EMPTY_SELECTION, type NeoSelection } from '@/components/admin/neo/sigma-canvas'
import { NeoGraphSearch } from '@/components/admin/neo/graph-search'
import {
  NeoGraphFiltersPanel,
  NeoGraphLegend,
} from '@/components/admin/neo/graph-filters'
import { NeoNodeDetailPanel } from '@/components/admin/neo/node-detail-panel'
import { useNeoKindColors } from '@/lib/admin/neo-graph/use-neo-colors'
import {
  DEFAULT_NEO_FILTERS,
  type DoxaGraphProjection,
  type NeoGraphFilters,
} from '@/lib/admin/neo-graph/types'
import { cn } from '@/lib/utils'

export type UtteranceHighlight = {
  start: number
  end: number
  documentUid: string | null
}

export function NeoProjectionExplorer({
  projection,
  contextStoryId,
  defaultFilters = DEFAULT_NEO_FILTERS,
  onUtteranceHighlight,
  className,
}: {
  projection: DoxaGraphProjection
  /** Used for "Story hub" when selection has no documentUid. */
  contextStoryId: string | null
  defaultFilters?: NeoGraphFilters
  onUtteranceHighlight: (span: UtteranceHighlight | null) => void
  className?: string
}) {
  const kindColors = useNeoKindColors()
  const colorRevision = useMemo(() => JSON.stringify(kindColors), [kindColors])
  const [filters, setFilters] = useState<NeoGraphFilters>(defaultFilters)
  const [selection, setSelection] = useState<NeoSelection>(EMPTY_SELECTION)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const [layoutTick, setLayoutTick] = useState(0)
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0, truncated: false })
  const [showFilters, setShowFilters] = useState(false)

  const handleSelection = useCallback(
    (next: NeoSelection) => {
      setSelection(next)
      if (
        next.kind === 'utterance' &&
        next.charStart != null &&
        next.charEnd != null
      ) {
        const documentUid =
          typeof next.properties?.documentUid === 'string'
            ? next.properties.documentUid
            : contextStoryId
        onUtteranceHighlight({
          start: next.charStart,
          end: next.charEnd,
          documentUid,
        })
      } else {
        onUtteranceHighlight(null)
      }
    },
    [contextStoryId, onUtteranceHighlight]
  )

  const clearSelection = useCallback(() => {
    handleSelection(EMPTY_SELECTION)
  }, [handleSelection])

  const detailStoryId =
    (typeof selection.properties?.documentUid === 'string'
      ? selection.properties.documentUid
      : null) ||
    contextStoryId ||
    projection.storyId ||
    projection.rootId

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <div className="absolute inset-0 overflow-hidden rounded-none">
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 30% 20%, rgba(61,90,128,0.18), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(45,90,74,0.16), transparent 50%)',
          }}
        />
        <NeoSigmaCanvas
          projection={projection}
          filters={filters}
          colorRevision={colorRevision}
          selectedNodeId={selection.nodeId}
          focusNodeId={focusNodeId}
          layoutTick={layoutTick}
          onSelectionChange={handleSelection}
          onGraphStats={setStats}
          onHoverLabel={setHoverLabel}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-3 top-3 flex max-w-[min(100%,28rem)] flex-col gap-2">
          <NeoGraphSearch
            projection={projection}
            onSelect={(nodeId) => {
              const node = projection.nodes.find((n) => n.id === nodeId)
              if (!node) return
              handleSelection({
                ...EMPTY_SELECTION,
                nodeId,
                kind: node.kind,
                label: node.label,
                charStart: node.charStart,
                charEnd: node.charEnd,
                properties: node.properties,
              })
              setFocusNodeId(nodeId)
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full border border-white/10 bg-black/55 text-zinc-100 backdrop-blur hover:bg-black/70"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? 'Hide filters' : 'Filters'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full border border-white/10 bg-black/55 text-zinc-100 backdrop-blur hover:bg-black/70"
              onClick={() => setLayoutTick((n) => n + 1)}
            >
              Relayout
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full border border-white/10 bg-black/55 text-zinc-100 backdrop-blur hover:bg-black/70"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent('neo-graph-camera', { detail: 'fit' })
                )
              }}
            >
              Fit
            </Button>
          </div>
          {showFilters ? (
            <NeoGraphFiltersPanel filters={filters} onChange={setFilters} />
          ) : null}
        </div>

        <div className="pointer-events-auto absolute bottom-3 left-3">
          <NeoGraphLegend />
          <p className="mt-2 rounded-lg border border-white/10 bg-black/55 px-2.5 py-1.5 text-[11px] text-zinc-400 backdrop-blur">
            {stats.nodes} nodes · {stats.edges} edges
            {stats.truncated || projection.queryTruncated ? ' · truncated' : ''}
            {hoverLabel ? ` · ${hoverLabel}` : ''}
          </p>
        </div>

        {(selection.nodeId || selection.edgeId) && (
          <div className="pointer-events-auto absolute bottom-0 right-0 top-0 w-full max-w-sm">
            <NeoNodeDetailPanel
              selection={selection}
              storyId={detailStoryId}
              onClose={clearSelection}
              onFocus={() => {
                if (selection.nodeId) setFocusNodeId(selection.nodeId)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
