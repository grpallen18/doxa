'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import '@/components/admin/neo/neo-sigma.css'
import { NeoZoomControls } from '@/components/admin/neo/neo-zoom-controls'
import {
  NEO_LABEL_COLOR_DIMMED,
  NEO_LABEL_COLOR_EMPHASIS,
  NEO_LABEL_COLOR_IDLE,
  NEO_EDGE_SIZE_IDLE,
  NEO_EDGE_IDLE_ALPHA,
  resolveEdgeGradientAt,
} from '@/lib/admin/neo-graph/appearance'
import { withPremultipliedAlpha, lerpHex, withLabelAlpha } from '@/lib/admin/neo-graph/colors'
import {
  createFadedNeoNodeHover,
  drawNeoNodeHover,
} from '@/lib/admin/neo-graph/draw-node-hover'
import { NeoCurvedArrowProgram } from '@/lib/admin/neo-graph/edge-program'
import {
  buildGraphologyFromProjection,
  snapshotGraphPositions,
  type NeoNodePosition,
  type NeoSigmaGraph,
  type SigmaEdgeAttributes,
  type SigmaNodeAttributes,
} from '@/lib/admin/neo-graph/graphology-adapter'
import { createNeoHoverFade } from '@/lib/admin/neo-graph/hover-fade'
import {
  assignEdgeWeights,
  buildFa2WorkerSettings,
  hashSeed,
  isBackboneKind,
  placeNodesHierarchically,
  seedHierarchicalPositions,
  separateOverlaps,
  workerBudgetMs,
} from '@/lib/admin/neo-graph/layout-pipeline'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker'
import {
  applyNeoLod,
  collectForceVisibleLeafPath,
  lodLevelFromRatio,
  NEO_LOD_FAR_RATIO,
  type NeoLodLevel,
} from '@/lib/admin/neo-graph/lod'
import { drawDocumentEnvelopes } from '@/lib/admin/neo-graph/draw-envelopes'
import { frameGraphInViewport } from '@/lib/admin/neo-graph/frame-viewport'
import {
  clusterMemberBounds,
} from '@/lib/admin/neo-graph/overview-clusters'
import { NeoNodeProgram } from '@/lib/admin/neo-graph/node-program'
import { collectNeighborhood } from '@/lib/admin/neo-graph/neighborhood'
import type {
  DoxaGraphProjection,
  NeoGraphFilters,
  NeoLabelVisibility,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import {
  DEFAULT_NEO_FA2_SETTINGS,
  DEFAULT_NEO_LABEL_VISIBILITY,
} from '@/lib/admin/neo-graph/types'

export type NeoSelection = {
  nodeId: string | null
  kind: SigmaNodeAttributes['kind'] | null
  label: string | null
  charStart?: number
  charEnd?: number
  properties: SigmaNodeAttributes['properties'] | null
  /** Overview cluster members (document node ids). */
  memberIds?: string[] | null
  edgeId: string | null
  edgeType: SigmaEdgeAttributes['edgeType'] | null
  edgeLabel: string | null
  edgeProperties: SigmaEdgeAttributes['properties'] | null
  edgeSource: string | null
  edgeTarget: string | null
}

const EMPTY_SELECTION: NeoSelection = {
  nodeId: null,
  kind: null,
  label: null,
  properties: null,
  memberIds: null,
  edgeId: null,
  edgeType: null,
  edgeLabel: null,
  edgeProperties: null,
  edgeSource: null,
  edgeTarget: null,
}

const LAYOUT_MS_FILTER_NEW = 120
const LAYOUT_MS_FILTER_PRESERVE = 40

type LayoutPassMode = 'initial' | 'relayout' | 'filter-new' | 'filter-preserve'

/**
 * Union projections all share projectionId `union-documents`. Include the
 * document set so changing the story cap forces a fresh layout instead of
 * preserving a crushed 26-story arrangement when loading 27.
 */
function projectionLayoutKey(projection: DoxaGraphProjection): string {
  const docIds =
    projection.documents?.map((d) => d.uid).sort().join(',') ||
    projection.nodes
      .filter((n) => n.kind === 'document')
      .map((n) => n.id)
      .sort()
      .join(',')
  const base =
    projection.projectionId ||
    projection.storyId ||
    projection.rootId ||
    'neo-graph'
  return `${base}|${docIds.length}|${hashSeed(docIds)}`
}

function GraphLifecycle({
  projection,
  filters,
  labelVisibility,
  colorRevision,
  selectedNodeId,
  focusNodeId,
  previewNodeId,
  onSelectionChange,
  onGraphStats,
  onHoverLabel,
  onHoverKind,
  onLayoutBusy,
  onLodLevel,
  expandClusterId = null,
  expandClusterToken = 0,
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  labelVisibility: NeoLabelVisibility
  colorRevision: string
  selectedNodeId: string | null
  focusNodeId: string | null
  previewNodeId: string | null
  onSelectionChange: (selection: NeoSelection) => void
  onGraphStats: (stats: {
    nodes: number
    edges: number
    truncated: boolean
  }) => void
  onHoverLabel: (label: string | null) => void
  onHoverKind: (kind: NeoNodeKind | null) => void
  onLayoutBusy?: (busy: boolean, durationMs?: number) => void
  onLodLevel?: (level: NeoLodLevel) => void
  /** When token increments, animate camera to expand this cluster. */
  expandClusterId?: string | null
  expandClusterToken?: number
}) {
  const sigma = useSigma()
  const loadGraph = useLoadGraph()
  const setSettings = useSetSettings()
  const registerEvents = useRegisterEvents()
  const graphRef = useRef<NeoSigmaGraph | null>(null)
  const positionsRef = useRef<Map<string, NeoNodePosition>>(new Map())
  const projectionKeyRef = useRef<string | null>(null)
  /** Until the first full FA2 finishes for this key, every rebuild keeps the long initial duration. */
  const initialCompleteRef = useRef(false)
  const layoutEpochRef = useRef(0)
  const fa2SupervisorRef = useRef<InstanceType<
    typeof FA2LayoutSupervisor
  > | null>(null)
  const selectedRef = useRef<string | null>(selectedNodeId)
  selectedRef.current = selectedNodeId
  const focusRef = useRef<string | null>(focusNodeId)
  focusRef.current = focusNodeId
  const previewRef = useRef<string | null>(previewNodeId)
  previewRef.current = previewNodeId
  const labelVisibilityRef = useRef(labelVisibility)
  labelVisibilityRef.current = labelVisibility
  const lodLevelRef = useRef<NeoLodLevel>('near')
  const onLodLevelRef = useRef(onLodLevel)
  onLodLevelRef.current = onLodLevel
  const expandTokenRef = useRef(expandClusterToken)
  const hoveredNodeRef = useRef<string | null>(null)
  const hoveredEdgeRef = useRef<string | null>(null)
  const previewHoverActiveRef = useRef(false)
  const hoverFadeRef = useRef(createNeoHoverFade())
  const edgeFadeRef = useRef(createNeoHoverFade())
  const selectionFadeRef = useRef(createNeoHoverFade())
  const onLayoutBusyRef = useRef(onLayoutBusy)
  onLayoutBusyRef.current = onLayoutBusy
  const onHoverLabelRef = useRef(onHoverLabel)
  onHoverLabelRef.current = onHoverLabel
  const onHoverKindRef = useRef(onHoverKind)
  onHoverKindRef.current = onHoverKind
  const drawNodeHover = useMemo(
    () =>
      createFadedNeoNodeHover(
        () => hoverFadeRef.current,
        () => selectionFadeRef.current.getNodeId()
      ),
    []
  )

  const syncLod = (
    graph: NeoSigmaGraph,
    options?: { rebuildClusters?: boolean }
  ) => {
    const forceVisible = new Set<string>()
    for (const id of [
      selectedRef.current,
      focusRef.current,
      previewRef.current,
    ]) {
      for (const n of collectForceVisibleLeafPath(graph, id)) forceVisible.add(n)
    }
    applyNeoLod(graph, {
      level: lodLevelRef.current,
      forceVisibleIds: forceVisible,
      rebuildClusters: options?.rebuildClusters ?? false,
    })
  }

  const expandClusterCamera = (clusterId: string) => {
    const graph = sigma.getGraph() as NeoSigmaGraph
    if (!graph.hasNode(clusterId)) return
    const bounds = clusterMemberBounds(graph, clusterId)
    const attrs = graph.getNodeAttributes(clusterId)
    const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : attrs.x
    const cy = bounds ? (bounds.minY + bounds.maxY) / 2 : attrs.y
    const camera = sigma.getCamera()
    void camera.animate(
      {
        x: cx,
        y: cy,
        ratio: Math.min(camera.ratio, NEO_LOD_FAR_RATIO * 0.85),
      },
      { duration: 450 }
    )
  }

  // Flex parents / Fast Refresh often mount Sigma at 0–1px. ResizeObserver
  // alone is not enough: if the first measure is tiny we used to bail, and if
  // the container is already "full size" when we attach, RO never fires again
  // — canvases stay stuck at 1px until a hard reload.
  useEffect(() => {
    const container = sigma.getContainer()
    if (!container) return

    let raf = 0
    let tries = 0
    let wasTiny = false
    const MAX_TRIES = 180

    const syncSize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width < 2 || height < 2) {
        wasTiny = true
        if (tries < MAX_TRIES) {
          tries += 1
          raf = window.requestAnimationFrame(syncSize)
        }
        return
      }
      tries = 0
      try {
        sigma.resize(true)
        sigma.refresh()
        // After HMR / flex collapse recovery, re-frame so the graph fills
        // the restored canvas instead of sitting in a leftover subsection.
        if (wasTiny && initialCompleteRef.current) {
          wasTiny = false
          frameGraphInViewport(sigma)
        } else {
          wasTiny = false
        }
      } catch {
        /* sigma torn down mid-HMR */
      }
    }

    syncSize()
    const observer = new ResizeObserver(() => {
      tries = 0
      syncSize()
    })
    observer.observe(container)
    const parent = container.parentElement
    if (parent) observer.observe(parent)

    const onViewport = () => {
      tries = 0
      syncSize()
    }
    window.addEventListener('resize', onViewport)
    document.addEventListener('visibilitychange', onViewport)

    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', onViewport)
      document.removeEventListener('visibilitychange', onViewport)
    }
  }, [sigma])

  const commitPositionsFromSigma = () => {
    try {
      positionsRef.current = snapshotGraphPositions(
        sigma.getGraph() as NeoSigmaGraph
      )
    } catch {
      /* sigma graph may be unmounted */
    }
  }

  const disposeFa2 = () => {
    const layout = fa2SupervisorRef.current
    fa2SupervisorRef.current = null
    if (!layout) return
    try {
      layout.kill()
    } catch {
      /* already stopped */
    }
  }

  const finishLayoutPass = (
    graph: NeoSigmaGraph,
    epoch: number,
    onComplete?: () => void,
    options?: { frameViewport?: boolean }
  ) => {
    if (layoutEpochRef.current !== epoch) return
    separateOverlaps(graph, undefined, undefined, {
      pinKind: isBackboneKind,
    })
    syncLod(graph, {
      rebuildClusters: lodLevelRef.current === 'overview',
    })
    try {
      sigma.setCustomBBox(null)
    } catch {
      /* older sigma */
    }
    sigma.refresh()
    if (options?.frameViewport) {
      frameGraphInViewport(sigma)
    }
    commitPositionsFromSigma()
    onComplete?.()
    onLayoutBusyRef.current?.(false)
  }

  /**
   * Hierarchical seed (publication-first) + soft FA2 polish.
   * Filter toggles preserve positions; Apply / new projection reconstruts.
   */
  const runLayout = (
    mode: LayoutPassMode,
    newNodeIds: string[] = [],
    onComplete?: () => void
  ) => {
    const epoch = ++layoutEpochRef.current
    disposeFa2()

    const graph = sigma.getGraph() as NeoSigmaGraph
    assignEdgeWeights(graph)

    if (mode === 'filter-preserve') {
      onLayoutBusyRef.current?.(true, LAYOUT_MS_FILTER_PRESERVE)
      finishLayoutPass(graph, epoch, onComplete, { frameViewport: false })
      return window.setTimeout(() => {
        /* busy already cleared in finishLayoutPass */
      }, LAYOUT_MS_FILTER_PRESERVE)
    }

    if (mode === 'filter-new') {
      onLayoutBusyRef.current?.(true, LAYOUT_MS_FILTER_NEW)
      if (newNodeIds.length > 0) {
        placeNodesHierarchically(graph, newNodeIds)
      }
      finishLayoutPass(graph, epoch, onComplete, { frameViewport: false })
      return window.setTimeout(() => {}, LAYOUT_MS_FILTER_NEW)
    }

    // initial — hierarchical seed then soft FA2 polish
    // relayout — FA2 from current positions (internal; no user re-apply UI)
    if (mode === 'initial') {
      seedHierarchicalPositions(graph)
    }
    const budget = workerBudgetMs(graph.order)
    onLayoutBusyRef.current?.(true, budget)

    const settings = buildFa2WorkerSettings(graph, DEFAULT_NEO_FA2_SETTINGS)

    try {
      const layout = new FA2LayoutSupervisor(graph, {
        getEdgeWeight: 'weight',
        settings,
      })
      fa2SupervisorRef.current = layout
      layout.start()
    } catch {
      // Worker unavailable — fall back to a short sync FA2 pass.
      forceAtlas2.assign(graph, {
        iterations: Math.min(60, Math.max(15, Math.floor(graph.order / 40))),
        getEdgeWeight: 'weight',
        settings,
      })
      finishLayoutPass(graph, epoch, onComplete, { frameViewport: true })
      return window.setTimeout(() => {}, 50)
    }

    return window.setTimeout(() => {
      if (layoutEpochRef.current !== epoch) return
      const layout = fa2SupervisorRef.current
      fa2SupervisorRef.current = null
      try {
        layout?.stop()
      } catch {
        /* ignore */
      }
      try {
        layout?.kill()
      } catch {
        /* ignore */
      }
      finishLayoutPass(graph, epoch, onComplete, { frameViewport: true })
    }, budget)
  }

  useEffect(() => {
    const key = projectionLayoutKey(projection)
    const isNewProjection = projectionKeyRef.current !== key
    if (isNewProjection) {
      positionsRef.current = new Map()
      projectionKeyRef.current = key
      initialCompleteRef.current = false
    } else {
      // Prefer live Sigma positions over last committed snapshot.
      try {
        positionsRef.current = snapshotGraphPositions(
          sigma.getGraph() as NeoSigmaGraph
        )
      } catch {
        /* keep existing cache */
      }
    }

    const built = buildGraphologyFromProjection(projection, filters, {
      positions: isNewProjection ? undefined : positionsRef.current,
    })

    graphRef.current = built.graph
    loadGraph(built.graph)
    // Double-rAF: after HMR, the first layout pass can still see a 1px box.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          sigma.resize(true)
          sigma.refresh()
        } catch {
          /* unmounted */
        }
      })
    })
    positionsRef.current = snapshotGraphPositions(built.graph)
    onGraphStats({
      nodes: built.nodeCount,
      edges: built.edgeCount,
      truncated: built.truncated,
    })

    // Parent re-renders / color hydration used to restart this effect and
    // downgrade a fresh load to a short filter settle — keep INITIAL until done.
    const awaitingInitial = !initialCompleteRef.current
    // Kind filter toggles must not force a full FA2 reconstruct (documents
    // reappearing used to look like "new docs" and trigger Arranging graph…).
    const mode: LayoutPassMode = awaitingInitial
      ? 'initial'
      : built.newNodeCount > 0
        ? 'filter-new'
        : 'filter-preserve'

    const timer = runLayout(mode, built.newNodeIds, () => {
      initialCompleteRef.current = true
    })
    return () => {
      window.clearTimeout(timer)
      layoutEpochRef.current += 1
      disposeFa2()
      commitPositionsFromSigma()
      onLayoutBusyRef.current?.(false)
    }
    // colorRevision forces rebuild so kind colors refresh on nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, filters, colorRevision])

  useEffect(() => {
    return () => {
      disposeFa2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zoom LOD: mid envelopes / overview clusters by camera ratio.
  useEffect(() => {
    const camera = sigma.getCamera()
    const applyFromRatio = (ratio: number) => {
      const prev = lodLevelRef.current
      const next = lodLevelFromRatio(ratio)
      const changed = next !== prev
      lodLevelRef.current = next
      if (changed) onLodLevelRef.current?.(next)
      try {
        const graph = sigma.getGraph() as NeoSigmaGraph
        const enteringOverview = changed && next === 'overview'
        syncLod(graph, { rebuildClusters: enteringOverview })
        sigma.refresh()
        drawDocumentEnvelopes(sigma, next)
      } catch {
        /* unmounted */
      }
    }
    applyFromRatio(camera.ratio)
    const onUpdated = (state: { ratio: number }) => {
      applyFromRatio(state.ratio)
    }
    camera.on('updated', onUpdated)
    const onAfterRender = () => {
      drawDocumentEnvelopes(sigma, lodLevelRef.current)
    }
    sigma.on('afterRender', onAfterRender)
    return () => {
      camera.off('updated', onUpdated)
      sigma.off('afterRender', onAfterRender)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma])

  // Keep focused/selected leaves visible while collapsed.
  useEffect(() => {
    try {
      const graph = sigma.getGraph() as NeoSigmaGraph
      syncLod(graph, { rebuildClusters: false })
      sigma.refresh()
      drawDocumentEnvelopes(sigma, lodLevelRef.current)
    } catch {
      /* graph not ready */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, focusNodeId, previewNodeId, sigma])

  // Detail-panel / double-click expand request.
  useEffect(() => {
    if (expandTokenRef.current === expandClusterToken) return
    expandTokenRef.current = expandClusterToken
    if (expandClusterToken <= 0 || !expandClusterId) return
    expandClusterCamera(expandClusterId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandClusterId, expandClusterToken, sigma])

  useEffect(() => {
    const fade = hoverFadeRef.current
    const edgeFade = edgeFadeRef.current
    /**
     * Must refresh (re-run reducers) each frame so edge size/color can lerp
     * with the same 300ms ease-out as node hover.
     */
    const tickHover = () => {
      sigma.refresh()
    }
    const syncHoverLayer = () => {
      sigma.refresh()
    }

    registerEvents({
      clickNode: ({ node }) => {
        if (selectedRef.current === node) {
          onSelectionChange(EMPTY_SELECTION)
          return
        }
        const g = sigma.getGraph()
        const attrs = g.getNodeAttributes(node) as SigmaNodeAttributes
        onSelectionChange({
          ...EMPTY_SELECTION,
          nodeId: node,
          kind: attrs.kind,
          label: attrs.fullLabel,
          charStart: attrs.charStart,
          charEnd: attrs.charEnd,
          properties: attrs.properties,
          memberIds:
            attrs.kind === 'cluster' && Array.isArray(attrs.memberIds)
              ? attrs.memberIds
              : null,
        })
      },
      doubleClickNode: ({ node }) => {
        const g = sigma.getGraph() as NeoSigmaGraph
        if (!g.hasNode(node)) return
        const kind = g.getNodeAttribute(node, 'kind')
        if (kind === 'cluster') {
          expandClusterCamera(node)
        }
      },
      clickEdge: ({ edge }) => {
        const g = sigma.getGraph()
        const attrs = g.getEdgeAttributes(edge) as SigmaEdgeAttributes
        const [source, target] = g.extremities(edge)
        onSelectionChange({
          ...EMPTY_SELECTION,
          edgeId: edge,
          edgeType: attrs.edgeType,
          edgeLabel: attrs.label,
          edgeProperties: attrs.properties,
          edgeSource: source,
          edgeTarget: target,
        })
      },
      clickStage: () => {
        onSelectionChange(EMPTY_SELECTION)
        onHoverLabel(null)
        onHoverKind(null)
        hoveredNodeRef.current = null
        hoveredEdgeRef.current = null
        edgeFade.leave(tickHover)
        fade.leave(tickHover)
        syncHoverLayer()
      },
      enterNode: ({ node }) => {
        const g = sigma.getGraph()
        const attrs = g.getNodeAttributes(node) as SigmaNodeAttributes
        onHoverLabel(`${attrs.kind}: ${attrs.fullLabel}`)
        onHoverKind(attrs.kind)
        hoveredNodeRef.current = node
        hoveredEdgeRef.current = null
        edgeFade.leave(tickHover)
        fade.enter(node, tickHover)
        syncHoverLayer()
      },
      leaveNode: () => {
        onHoverLabel(null)
        onHoverKind(null)
        hoveredNodeRef.current = null
        fade.leave(tickHover)
        // Keep the node highlighted while progress > 0 so Sigma does not
        // clear the hover layer to idle before the fade-out starts.
        syncHoverLayer()
      },
      enterEdge: ({ edge }) => {
        const g = sigma.getGraph()
        const attrs = g.getEdgeAttributes(edge) as SigmaEdgeAttributes
        const [source, target] = g.extremities(edge)
        const sLabel = (g.getNodeAttributes(source) as SigmaNodeAttributes).label
        const tLabel = (g.getNodeAttributes(target) as SigmaNodeAttributes).label
        onHoverLabel(`${attrs.edgeType}: ${sLabel} → ${tLabel}`)
        onHoverKind(null)
        hoveredEdgeRef.current = edge
        hoveredNodeRef.current = null
        fade.leave(tickHover)
        edgeFade.enter(edge, tickHover)
        syncHoverLayer()
      },
      leaveEdge: () => {
        onHoverLabel(null)
        onHoverKind(null)
        hoveredEdgeRef.current = null
        edgeFade.leave(tickHover)
        syncHoverLayer()
      },
    })
  }, [onHoverKind, onHoverLabel, onSelectionChange, registerEvents, sigma])

  useEffect(() => {
    const fade = hoverFadeRef.current
    const edgeFade = edgeFadeRef.current
    const selectionFade = selectionFadeRef.current
    return () => {
      fade.dispose()
      edgeFade.dispose()
      selectionFade.dispose()
    }
  }, [])

  useEffect(() => {
    const selectionFade = selectionFadeRef.current
    const tick = () => {
      sigma.refresh()
    }
    if (selectedNodeId) {
      selectionFade.enter(selectedNodeId, tick, { preserveProgress: true })
    } else {
      selectionFade.leave(tick)
    }
  }, [selectedNodeId, sigma])

  useEffect(() => {
    setSettings({
      allowInvalidContainer: true,
      enableEdgeEvents: true,
      // Default is 1.7px — that clamps idle/active size so they look identical.
      minEdgeThickness: 0.5,
      renderEdgeLabels: false,
      labelDensity: 0.15,
      labelGridCellSize: 80,
      labelRenderedSizeThreshold: 8,
      labelColor: {
        attribute: 'labelColor',
        color: NEO_LABEL_COLOR_IDLE,
      },
      defaultDrawNodeHover: drawNodeHover,
      defaultNodeType: 'circle',
      nodeProgramClasses: {
        circle: NeoNodeProgram,
      },
      defaultEdgeType: 'curvedArrow',
      edgeProgramClasses: {
        curvedArrow: NeoCurvedArrowProgram,
      },
      zIndex: true,
      nodeReducer: (node, data) => {
        const g = sigma.getGraph()
        const hoverFade = hoverFadeRef.current
        const selectionFade = selectionFadeRef.current
        const selId = selectionFade.getNodeId()
        const selT = selectionFade.getProgress()
        const kindLabelsOn = Boolean(
          labelVisibilityRef.current[data.kind as NeoNodeKind]
        )
        const fullLabel =
          typeof data.fullLabel === 'string' && data.fullLabel
            ? data.fullLabel
            : typeof data.label === 'string'
              ? data.label
              : ''
        const res = { ...data }
        if (data.lodHidden) {
          res.hidden = true
          return res
        }
        const densifiedDoc =
          data.kind === 'document' &&
          typeof data.label === 'string' &&
          data.label.length > 0 &&
          data.label !== fullLabel
        const shownLabel = densifiedDoc ? data.label : fullLabel
        // Keep fading node on Sigma's hover layer after leaveNode clears hoveredNode.
        // Skip when it's the selection — that node is already highlighted.
        if (
          hoverFade.getNodeId() === node &&
          hoverFade.getProgress() > 0 &&
          selId !== node
        ) {
          res.highlighted = true
        }
        if (!selId || selT <= 0) {
          if (densifiedDoc) {
            res.forceLabel = true
            res.label = shownLabel
            res.labelColor = NEO_LABEL_COLOR_IDLE
            return res
          }
          res.forceLabel = kindLabelsOn
          res.label = kindLabelsOn ? shownLabel : ''
          res.labelColor = NEO_LABEL_COLOR_IDLE
          return res
        }
        const { nodes } = collectNeighborhood(g as NeoSigmaGraph, selId)
        if (node === selId) {
          res.highlighted = true
          res.forceLabel = true
          res.label = shownLabel
          res.zIndex = 2
          const tone = lerpHex(
            NEO_LABEL_COLOR_IDLE,
            NEO_LABEL_COLOR_EMPHASIS,
            selT
          )
          // Legend-visible labels only shift color; selection-forced labels fade alpha.
          res.labelColor =
            kindLabelsOn || densifiedDoc ? tone : withLabelAlpha(tone, selT)
        } else if (nodes.has(node)) {
          res.forceLabel = true
          res.label = shownLabel
          res.zIndex = 1
          const tone = lerpHex(
            NEO_LABEL_COLOR_IDLE,
            NEO_LABEL_COLOR_EMPHASIS,
            selT
          )
          res.labelColor =
            kindLabelsOn || densifiedDoc ? tone : withLabelAlpha(tone, selT)
        } else {
          const base =
            typeof data.color === 'string' && data.color ? data.color : '#888888'
          res.color = lerpHex(base, '#3a3a3a', selT)
          if (densifiedDoc) {
            res.forceLabel = true
            res.label = shownLabel
          } else {
            res.forceLabel = kindLabelsOn
            res.label = kindLabelsOn ? shownLabel : ''
          }
          res.labelColor = lerpHex(
            NEO_LABEL_COLOR_IDLE,
            NEO_LABEL_COLOR_DIMMED,
            selT
          )
          res.zIndex = 0
        }
        return res
      },
      edgeReducer: (edge, data) => {
        const g = sigma.getGraph()
        const hoverFade = hoverFadeRef.current
        const edgeFade = edgeFadeRef.current
        const selectionFade = selectionFadeRef.current
        const selId = selectionFade.getNodeId()
        const selT = selectionFade.getProgress()
        const hoverNodeId = hoverFade.getNodeId()
        const hoverT = hoverFade.getProgress()
        const res = { ...data }
        if (data.lodHidden) {
          res.hidden = true
          return res
        }
        const [source, target] = g.extremities(edge)
        const sourceHex =
          (g.getNodeAttribute(source, 'color') as string) || '#888888'
        const targetHex =
          (g.getNodeAttribute(target, 'color') as string) || '#888888'

        const fadeEdgeId = edgeFade.getNodeId()
        const edgeProgress = edgeFade.getProgress()
        if (fadeEdgeId === edge && edgeProgress > 0) {
          const appearance = resolveEdgeGradientAt(
            sourceHex,
            targetHex,
            edgeProgress
          )
          res.color = appearance.color
          res.targetColor = appearance.targetColor
          res.size = appearance.size
          res.zIndex = 1
          return res
        }

        const selNeighborhood =
          selId && selT > 0
            ? collectNeighborhood(g as NeoSigmaGraph, selId)
            : null
        const inSelNeighborhood = Boolean(selNeighborhood?.edges.has(edge))
        const connectedToHover = Boolean(
          hoverNodeId &&
            hoverT > 0 &&
            (source === hoverNodeId || target === hoverNodeId)
        )

        // Related edges: take the stronger of hover vs selection so select/deselect
        // while still hovering does not restart or dump the fade.
        let activeT = 0
        if (connectedToHover) activeT = Math.max(activeT, hoverT)
        if (inSelNeighborhood) activeT = Math.max(activeT, selT)

        if (activeT > 0) {
          const appearance = resolveEdgeGradientAt(
            sourceHex,
            targetHex,
            activeT
          )
          res.color = appearance.color
          res.targetColor = appearance.targetColor
          res.size = appearance.size
          res.zIndex = 1
          return res
        }

        if (selId && selT > 0 && !inSelNeighborhood) {
          const dimAlpha =
            NEO_EDGE_IDLE_ALPHA + (0.35 - NEO_EDGE_IDLE_ALPHA) * selT
          res.hidden = false
          res.color = withPremultipliedAlpha(
            lerpHex(sourceHex, '#2a2a2a', selT),
            dimAlpha
          )
          res.targetColor = withPremultipliedAlpha(
            lerpHex(targetHex, '#2a2a2a', selT),
            dimAlpha
          )
          res.size = NEO_EDGE_SIZE_IDLE
          res.zIndex = 0
          return res
        }

        const idle = resolveEdgeGradientAt(sourceHex, targetHex, 0)
        res.color = idle.color
        res.targetColor = idle.targetColor
        res.size = NEO_EDGE_SIZE_IDLE
        res.zIndex = 0
        return res
      },
    })
  }, [drawNodeHover, labelVisibility, setSettings, sigma, selectedNodeId])

  useEffect(() => {
    sigma.refresh()
  }, [labelVisibility, sigma])

  useEffect(() => {
    // Search/detail "focus" used to pan the camera via getNodeDisplayData.
    // That consistently threw the view into empty space (framed vs raw coords /
    // stage resize races). Selection + hover already surface the node — leave
    // framing to the user / ZoomControl reset.
    if (!focusNodeId || !sigma.getGraph().hasNode(focusNodeId)) return
    sigma.refresh()
  }, [focusNodeId, sigma])

  // Search-suggestion hover mirrors enterNode / leaveNode on the canvas.
  useEffect(() => {
    const fade = hoverFadeRef.current
    const edgeFade = edgeFadeRef.current
    const tick = () => {
      sigma.refresh()
    }

    if (previewNodeId && sigma.getGraph().hasNode(previewNodeId)) {
      const attrs = sigma.getGraph().getNodeAttributes(
        previewNodeId
      ) as SigmaNodeAttributes
      previewHoverActiveRef.current = true
      onHoverLabelRef.current(`${attrs.kind}: ${attrs.fullLabel}`)
      onHoverKindRef.current(attrs.kind)
      hoveredNodeRef.current = previewNodeId
      hoveredEdgeRef.current = null
      edgeFade.leave(tick)
      fade.enter(previewNodeId, tick)
      tick()
      return
    }

    if (previewHoverActiveRef.current) {
      previewHoverActiveRef.current = false
      onHoverLabelRef.current(null)
      onHoverKindRef.current(null)
      hoveredNodeRef.current = null
      fade.leave(tick)
      tick()
    }
  }, [previewNodeId, sigma])

  return null
}

export function NeoSigmaCanvas({
  projection,
  filters,
  labelVisibility = DEFAULT_NEO_LABEL_VISIBILITY,
  colorRevision,
  selectedNodeId,
  focusNodeId,
  previewNodeId = null,
  onSelectionChange,
  onGraphStats,
  onHoverLabel,
  onHoverKind,
  onLayoutBusy,
  onLodLevel,
  expandClusterId = null,
  expandClusterToken = 0,
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  labelVisibility?: NeoLabelVisibility
  colorRevision: string
  selectedNodeId: string | null
  focusNodeId: string | null
  previewNodeId?: string | null
  onSelectionChange: (selection: NeoSelection) => void
  onGraphStats: (stats: {
    nodes: number
    edges: number
    truncated: boolean
  }) => void
  onHoverLabel: (label: string | null) => void
  onHoverKind: (kind: NeoNodeKind | null) => void
  onLayoutBusy?: (busy: boolean, durationMs?: number) => void
  onLodLevel?: (level: NeoLodLevel) => void
  expandClusterId?: string | null
  expandClusterToken?: number
}) {
  return (
    <SigmaContainer
      className="neo-sigma-root absolute inset-0 !bg-[#121212]"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 'auto',
        height: 'auto',
        minHeight: 0,
        background: '#121212',
        ['--sigma-background-color' as string]: '#121212',
        ['--sigma-controls-background-color' as string]: '#1a1a1a',
        ['--sigma-controls-background-color-hover' as string]:
          'rgba(255,255,255,0.1)',
        ['--sigma-controls-border-color' as string]: 'rgba(255,255,255,0.15)',
        ['--sigma-controls-color' as string]: '#e8e6e3',
      }}
      settings={{
        allowInvalidContainer: true,
        enableEdgeEvents: true,
        defaultNodeType: 'circle',
        nodeProgramClasses: {
          circle: NeoNodeProgram,
        },
        defaultEdgeType: 'curvedArrow',
        labelColor: {
          attribute: 'labelColor',
          color: NEO_LABEL_COLOR_IDLE,
        },
        defaultDrawNodeHover: drawNeoNodeHover,
        edgeProgramClasses: {
          curvedArrow: NeoCurvedArrowProgram,
        },
      }}
    >
      <GraphLifecycle
        projection={projection}
        filters={filters}
        labelVisibility={labelVisibility}
        colorRevision={colorRevision}
        selectedNodeId={selectedNodeId}
        focusNodeId={focusNodeId}
        previewNodeId={previewNodeId}
        onSelectionChange={onSelectionChange}
        onGraphStats={onGraphStats}
        onHoverLabel={onHoverLabel}
        onHoverKind={onHoverKind}
        onLayoutBusy={onLayoutBusy}
        onLodLevel={onLodLevel}
        expandClusterId={expandClusterId}
        expandClusterToken={expandClusterToken}
      />
      <NeoZoomControls />
    </SigmaContainer>
  )
}

export { EMPTY_SELECTION }
export type { NeoLodLevel }
