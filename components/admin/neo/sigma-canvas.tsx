'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  ControlsContainer,
  SigmaContainer,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
  ZoomControl,
} from '@react-sigma/core'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import '@react-sigma/core/lib/style.css'
import {
  NEO_LABEL_COLOR_DIMMED,
  NEO_LABEL_COLOR_EMPHASIS,
  NEO_LABEL_COLOR_IDLE,
  NEO_EDGE_SIZE_ACTIVE,
  NEO_EDGE_SIZE_IDLE,
  NEO_EDGE_IDLE_ALPHA,
  resolveEdgeAppearanceAt,
  resolveEdgeColor,
  resolveIdleEdgeColor,
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
  BACKBONE_ITERS_INITIAL,
  BACKBONE_ITERS_RELAYOUT,
  buildWorkerFa2Settings,
  layoutBackboneSync,
  placeLeavesInOrbits,
  separateOverlaps,
} from '@/lib/admin/neo-graph/layout-pipeline'
import {
  applyNeoLod,
  collectForceVisibleLeafPath,
  lodLevelFromRatio,
  type NeoLodLevel,
} from '@/lib/admin/neo-graph/lod'
import { NeoNodeProgram } from '@/lib/admin/neo-graph/node-program'
import { collectNeighborhood } from '@/lib/admin/neo-graph/neighborhood'
import type {
  DoxaGraphProjection,
  NeoFa2Settings,
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
  edgeId: null,
  edgeType: null,
  edgeLabel: null,
  edgeProperties: null,
  edgeSource: null,
  edgeTarget: null,
}

const LAYOUT_MS_INITIAL = 1800
const LAYOUT_MS_RELAYOUT = 1500
const LAYOUT_MS_FILTER_NEW = 700
const LAYOUT_MS_FILTER_PRESERVE = 300

type LayoutPassMode = 'initial' | 'relayout' | 'filter-new' | 'filter-preserve'

function projectionLayoutKey(projection: DoxaGraphProjection): string {
  return (
    projection.projectionId ||
    projection.storyId ||
    projection.rootId ||
    'neo-graph'
  )
}

function GraphLifecycle({
  projection,
  filters,
  fa2Settings,
  fa2ApplyToken,
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
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  fa2Settings: NeoFa2Settings
  fa2ApplyToken: number
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
  const fa2Ref = useRef<InstanceType<typeof FA2Layout> | null>(null)
  const selectedRef = useRef<string | null>(selectedNodeId)
  selectedRef.current = selectedNodeId
  const focusRef = useRef<string | null>(focusNodeId)
  focusRef.current = focusNodeId
  const previewRef = useRef<string | null>(previewNodeId)
  previewRef.current = previewNodeId
  const labelVisibilityRef = useRef(labelVisibility)
  labelVisibilityRef.current = labelVisibility
  const fa2SettingsRef = useRef(fa2Settings)
  fa2SettingsRef.current = fa2Settings
  const fa2ApplyTokenRef = useRef(fa2ApplyToken)
  const lodLevelRef = useRef<NeoLodLevel>('near')
  const onLodLevelRef = useRef(onLodLevel)
  onLodLevelRef.current = onLodLevel
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

  const syncLod = (graph: NeoSigmaGraph) => {
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
    })
  }

  // Flex parents often settle after Sigma mounts at 0–1px; keep canvases in sync.
  useEffect(() => {
    const container = sigma.getContainer()
    if (!container) return

    const syncSize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (width < 2 || height < 2) return
      sigma.resize(true)
      sigma.refresh()
    }

    syncSize()
    const raf = window.requestAnimationFrame(syncSize)
    const observer = new ResizeObserver(syncSize)
    observer.observe(container)
    return () => {
      window.cancelAnimationFrame(raf)
      observer.disconnect()
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
    const layout = fa2Ref.current
    fa2Ref.current = null
    if (!layout) return
    try {
      layout.stop()
    } catch {
      /* already stopped */
    }
    try {
      layout.kill()
    } catch {
      /* already killed */
    }
  }

  /**
   * Own the FA2 supervisor (do not use useWorkerLayoutForceAtlas2).
   * That hook binds asynchronously and start() is a no-op until the next
   * render — so initial load showed a veil while the graph sat idle.
   * Creating FA2 after loadGraph ties it to the populated Sigma graph.
   *
   * Pipeline: edge weights → backbone FA2 → leaf orbits → worker settle → collision.
   */
  const runLayout = (
    mode: LayoutPassMode,
    durationMs: number,
    newNodeIds: string[] = [],
    onComplete?: () => void
  ) => {
    const epoch = ++layoutEpochRef.current
    onLayoutBusyRef.current?.(true, durationMs)
    disposeFa2()

    const graph = sigma.getGraph() as NeoSigmaGraph
    assignEdgeWeights(graph)

    if (mode === 'initial' || mode === 'relayout') {
      layoutBackboneSync(
        graph,
        fa2SettingsRef.current,
        mode === 'initial' ? BACKBONE_ITERS_INITIAL : BACKBONE_ITERS_RELAYOUT
      )
      placeLeavesInOrbits(graph)
    } else if (newNodeIds.length > 0) {
      placeLeavesInOrbits(graph, { onlyNodeIds: new Set(newNodeIds) })
    }

    const layout = new FA2Layout(
      graph,
      buildWorkerFa2Settings(fa2SettingsRef.current)
    )
    fa2Ref.current = layout
    layout.start()

    return window.setTimeout(() => {
      if (layoutEpochRef.current !== epoch) return
      try {
        layout.stop()
      } catch {
        /* ignore */
      }
      try {
        separateOverlaps(sigma.getGraph() as NeoSigmaGraph)
        syncLod(sigma.getGraph() as NeoSigmaGraph)
        sigma.refresh()
      } catch {
        /* graph may be unmounted */
      }
      commitPositionsFromSigma()
      onComplete?.()
      onLayoutBusyRef.current?.(false)
    }, durationMs)
  }

  useEffect(() => {
    const key = projectionLayoutKey(projection)
    const isNewProjection = projectionKeyRef.current !== key
    if (isNewProjection) {
      positionsRef.current = new Map()
      projectionKeyRef.current = key
      initialCompleteRef.current = false
    } else {
      // Prefer live Sigma positions (post-FA2) over last committed snapshot.
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
    sigma.resize(true)
    positionsRef.current = snapshotGraphPositions(built.graph)
    onGraphStats({
      nodes: built.nodeCount,
      edges: built.edgeCount,
      truncated: built.truncated,
    })

    // Parent re-renders / color hydration used to restart this effect and
    // downgrade a fresh load to a short filter settle — keep INITIAL until done.
    const awaitingInitial = !initialCompleteRef.current
    const mode: LayoutPassMode = awaitingInitial
      ? 'initial'
      : built.newNodeCount > 0
        ? 'filter-new'
        : 'filter-preserve'
    const duration =
      mode === 'initial'
        ? LAYOUT_MS_INITIAL
        : mode === 'filter-new'
          ? LAYOUT_MS_FILTER_NEW
          : LAYOUT_MS_FILTER_PRESERVE

    const timer = runLayout(mode, duration, built.newNodeIds, () => {
      initialCompleteRef.current = true
    })
    return () => {
      window.clearTimeout(timer)
      layoutEpochRef.current += 1
      commitPositionsFromSigma()
      disposeFa2()
      onLayoutBusyRef.current?.(false)
    }
    // colorRevision forces rebuild so kind colors refresh on nodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, filters, colorRevision])

  // Restart FA2 when the filters panel applies gravity / scalingRatio.
  useEffect(() => {
    if (fa2ApplyTokenRef.current === fa2ApplyToken) return
    fa2ApplyTokenRef.current = fa2ApplyToken
    if (fa2ApplyToken <= 0) return

    const timer = runLayout('relayout', LAYOUT_MS_RELAYOUT, [], () => {
      initialCompleteRef.current = true
    })
    return () => {
      window.clearTimeout(timer)
      layoutEpochRef.current += 1
      commitPositionsFromSigma()
      disposeFa2()
      onLayoutBusyRef.current?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fa2ApplyToken])

  useEffect(() => {
    return () => {
      disposeFa2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Zoom LOD: collapse leaf kinds when camera is far out.
  useEffect(() => {
    const camera = sigma.getCamera()
    const applyFromRatio = (ratio: number) => {
      const next = lodLevelFromRatio(ratio)
      const changed = next !== lodLevelRef.current
      lodLevelRef.current = next
      if (changed) onLodLevelRef.current?.(next)
      try {
        const graph = sigma.getGraph() as NeoSigmaGraph
        syncLod(graph)
        sigma.refresh()
      } catch {
        /* unmounted */
      }
    }
    applyFromRatio(camera.ratio)
    const onUpdated = (state: { ratio: number }) => {
      applyFromRatio(state.ratio)
    }
    camera.on('updated', onUpdated)
    return () => {
      camera.off('updated', onUpdated)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigma])

  // Keep focused/selected leaves visible while far.
  useEffect(() => {
    try {
      const graph = sigma.getGraph() as NeoSigmaGraph
      syncLod(graph)
      sigma.refresh()
    } catch {
      /* graph not ready */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, focusNodeId, previewNodeId, sigma])

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
        })
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

        const fadeEdgeId = edgeFade.getNodeId()
        const edgeProgress = edgeFade.getProgress()
        if (fadeEdgeId === edge && edgeProgress > 0) {
          const appearance = resolveEdgeAppearanceAt(data.edgeType, edgeProgress)
          res.color = appearance.color
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
          const appearance = resolveEdgeAppearanceAt(data.edgeType, activeT)
          res.color = appearance.color
          res.size = appearance.size
          res.zIndex = 1
          return res
        }

        if (selId && selT > 0 && !inSelNeighborhood) {
          const solid = resolveEdgeColor(data.edgeType)
          const dimHex = lerpHex(solid, '#2a2a2a', selT)
          const dimAlpha =
            NEO_EDGE_IDLE_ALPHA + (0.35 - NEO_EDGE_IDLE_ALPHA) * selT
          res.hidden = false
          res.color = withPremultipliedAlpha(dimHex, dimAlpha)
          res.size = NEO_EDGE_SIZE_IDLE
          res.zIndex = 0
          return res
        }

        res.color = resolveIdleEdgeColor(data.edgeType)
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
  fa2Settings = DEFAULT_NEO_FA2_SETTINGS,
  fa2ApplyToken = 0,
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
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  fa2Settings?: NeoFa2Settings
  /** Incremented each time the UI applies FA2 params (forces a relayout). */
  fa2ApplyToken?: number
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
}) {
  return (
    <SigmaContainer
      className="relative h-full w-full !bg-[#121212]"
      style={{ height: '100%', width: '100%', background: '#121212' }}
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
        fa2Settings={fa2Settings}
        fa2ApplyToken={fa2ApplyToken}
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
      />
      <ControlsContainer position="bottom-right">
        <ZoomControl />
      </ControlsContainer>
    </SigmaContainer>
  )
}

export { EMPTY_SELECTION }
export type { NeoLodLevel }
