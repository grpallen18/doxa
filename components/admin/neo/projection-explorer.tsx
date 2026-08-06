'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ListFilter, Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
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
  DEFAULT_NEO_LABEL_VISIBILITY,
  type DoxaGraphProjection,
  type NeoGraphFilters,
  type NeoLabelVisibility,
  type NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import { lodLevelLabel, type NeoLodLevel } from '@/lib/admin/neo-graph/lod'
import { cn } from '@/lib/utils'

/**
 * Short filter settles delay the badge so they do not flash.
 * Initial (~5.3s) show the veil immediately.
 */
const LAYOUT_OVERLAY_SHORT_MS = 1000

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
  canvasOverlay,
  className,
}: {
  projection: DoxaGraphProjection
  /** Used for "Story hub" when selection has no documentUid. */
  contextStoryId: string | null
  defaultFilters?: NeoGraphFilters
  onUtteranceHighlight?: (span: UtteranceHighlight | null) => void
  /** Floated over the Sigma canvas (e.g. union story-cap control). */
  canvasOverlay?: ReactNode
  className?: string
}) {
  const kindColors = useNeoKindColors()
  const colorRevision = useMemo(() => JSON.stringify(kindColors), [kindColors])
  const [filters, setFilters] = useState<NeoGraphFilters>(defaultFilters)
  const [labelVisibility, setLabelVisibility] = useState<NeoLabelVisibility>(
    DEFAULT_NEO_LABEL_VISIBILITY
  )
  const [selection, setSelection] = useState<NeoSelection>(EMPTY_SELECTION)
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null)
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null)
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [hoverKind, setHoverKind] = useState<NeoNodeKind | null>(null)
  const [stats, setStats] = useState({ nodes: 0, edges: 0, truncated: false })
  const [lodLevel, setLodLevel] = useState<NeoLodLevel>('near')
  const [expandClusterId, setExpandClusterId] = useState<string | null>(null)
  const [expandClusterToken, setExpandClusterToken] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [layoutBusy, setLayoutBusy] = useState(false)
  const [showLayoutOverlay, setShowLayoutOverlay] = useState(false)
  const layoutDurationRef = useRef(0)

  const handleLayoutBusy = useCallback((busy: boolean, durationMs = 0) => {
    layoutDurationRef.current = busy ? durationMs : 0
    setLayoutBusy(busy)
  }, [])

  useEffect(() => {
    if (!layoutBusy) {
      setShowLayoutOverlay(false)
      return
    }
    const duration = layoutDurationRef.current
    const delay =
      duration > 0 && duration < LAYOUT_OVERLAY_SHORT_MS
        ? LAYOUT_OVERLAY_SHORT_MS
        : 0
    if (delay === 0) {
      setShowLayoutOverlay(true)
      return
    }
    const timer = window.setTimeout(() => {
      setShowLayoutOverlay(true)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [layoutBusy])

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
        onUtteranceHighlight?.({
          start: next.charStart,
          end: next.charEnd,
          documentUid,
        })
      } else {
        onUtteranceHighlight?.(null)
      }
    },
    [contextStoryId, onUtteranceHighlight]
  )

  const clearSelection = useCallback(() => {
    handleSelection(EMPTY_SELECTION)
  }, [handleSelection])

  const toggleLabelVisibility = useCallback((kind: NeoNodeKind) => {
    setLabelVisibility((prev) => ({
      ...prev,
      [kind]: !prev[kind],
    }))
  }, [])

  const selectFromSearch = useCallback(
    (nodeId: string) => {
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
      setPreviewNodeId(null)
    },
    [handleSelection, projection.nodes]
  )

  const detailStoryId =
    (typeof selection.properties?.documentUid === 'string'
      ? selection.properties.documentUid
      : null) ||
    contextStoryId ||
    projection.storyId ||
    projection.rootId

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      {/* Legend chrome — canvas clips below this bar. */}
      <div className="relative z-20 shrink-0 border-b border-white/10 bg-[#121212] px-3 py-1.5">
        <div
          className={cn(
            'flex items-center gap-2 transition-opacity duration-200 ease-out',
            showSearch ? 'pointer-events-none opacity-0' : 'opacity-100'
          )}
        >
          <button
            type="button"
            aria-label="Search graph"
            aria-pressed={showSearch}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5"
            onClick={() => {
              setShowFilters(false)
              setShowSearch(true)
            }}
          >
            <Search className="size-4" />
          </button>
          <NeoGraphLegend
            className="min-w-0 flex-1"
            highlightKind={hoverKind}
            labelVisibility={labelVisibility}
            onToggleLabel={toggleLabelVisibility}
          />
          <button
            type="button"
            aria-label={showFilters ? 'Hide filters' : 'Show filters'}
            aria-pressed={showFilters}
            className={cn(
              'shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5',
              showFilters && 'bg-white/5'
            )}
            onClick={() => {
              setShowSearch(false)
              setShowFilters((v) => !v)
            }}
          >
            <ListFilter className="size-4" />
          </button>
        </div>

        <div
          className={cn(
            'absolute inset-x-3 inset-y-1.5 z-30 flex items-center gap-2 transition-opacity duration-200 ease-out',
            showSearch
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          )}
          aria-hidden={!showSearch}
        >
          {showSearch ? (
            <>
              <button
                type="button"
                aria-label="Close search"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5"
                onClick={() => {
                  setShowSearch(false)
                  setPreviewNodeId(null)
                }}
              >
                <X className="size-4" />
              </button>
              <NeoGraphSearch
                className="min-w-0 flex-1"
                projection={projection}
                onHoverNode={setPreviewNodeId}
                onSelect={selectFromSearch}
                onClose={() => {
                  setShowSearch(false)
                  setPreviewNodeId(null)
                }}
              />
            </>
          ) : null}
        </div>

        {showFilters ? (
          <div className="absolute right-3 top-full z-30 mt-1 w-[min(calc(100vw-1.5rem),22rem)]">
            <NeoGraphFiltersPanel
              filters={filters}
              onChange={setFilters}
            />
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#121212]">
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 30% 20%, rgba(61,90,128,0.18), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(45,90,74,0.16), transparent 50%)',
          }}
        />
        {/* Absolute fill avoids Sigma mounting into a flex child that is still 0–1px tall. */}
        <div className="absolute inset-0 z-0">
          <NeoSigmaCanvas
            projection={projection}
            filters={filters}
            labelVisibility={labelVisibility}
            colorRevision={colorRevision}
            selectedNodeId={selection.nodeId}
            focusNodeId={focusNodeId}
            previewNodeId={previewNodeId}
            onSelectionChange={handleSelection}
            onGraphStats={setStats}
            onHoverLabel={setHoverLabel}
            onHoverKind={setHoverKind}
            onLayoutBusy={handleLayoutBusy}
            onLodLevel={setLodLevel}
            expandClusterId={expandClusterId}
            expandClusterToken={expandClusterToken}
          />
        </div>
        <div
          className={cn(
            'absolute inset-0 z-[20] flex items-center justify-center bg-[#121212]/55 backdrop-blur-[2px] transition-opacity duration-300 ease-out',
            showLayoutOverlay
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          )}
          aria-hidden={!showLayoutOverlay}
        >
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/75 px-4 py-2.5 text-sm text-zinc-200 shadow-lg transition-transform duration-300 ease-out',
              showLayoutOverlay
                ? 'translate-y-0 scale-100'
                : 'translate-y-1 scale-[0.98]'
            )}
            role="status"
            aria-live="polite"
          >
            <Spinner className="size-4 text-zinc-300" />
            <span>Arranging graph…</span>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {canvasOverlay ? (
            <div className="pointer-events-auto absolute left-3 top-3">
              {canvasOverlay}
            </div>
          ) : null}
          <div className="pointer-events-auto absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)]">
            <p className="rounded-lg border border-white/10 bg-black/80 px-2.5 py-1.5 text-[11px] text-zinc-400 backdrop-blur">
              {stats.nodes} nodes · {stats.edges} edges
              {stats.truncated || projection.queryTruncated
                ? ' · truncated'
                : ''}
              {lodLevel !== 'near' ? ` · ${lodLevelLabel(lodLevel)}` : ''}
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
                onExpandCluster={
                  selection.kind === 'cluster' && selection.nodeId
                    ? () => {
                        setExpandClusterId(selection.nodeId)
                        setExpandClusterToken((t) => t + 1)
                      }
                    : undefined
                }
                memberLabels={
                  selection.kind === 'cluster' && selection.memberIds
                    ? selection.memberIds.map((id) => {
                        const node = projection.nodes.find((n) => n.id === id)
                        return {
                          id,
                          label: node?.label ?? id,
                        }
                      })
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
