'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  ControlsContainer,
  SigmaContainer,
  useCamera,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
  ZoomControl,
} from '@react-sigma/core'
import { useWorkerLayoutForceAtlas2 } from '@react-sigma/layout-forceatlas2'
import { EdgeCurvedArrowProgram } from '@sigma/edge-curve'
import '@react-sigma/core/lib/style.css'
import {
  NEO_LABEL_COLOR_DIMMED,
  NEO_LABEL_COLOR_EMPHASIS,
  NEO_LABEL_COLOR_IDLE,
} from '@/lib/admin/neo-graph/appearance'
import { drawNeoNodeHover } from '@/lib/admin/neo-graph/draw-node-hover'
import {
  buildGraphologyFromProjection,
  type NeoSigmaGraph,
  type SigmaEdgeAttributes,
  type SigmaNodeAttributes,
} from '@/lib/admin/neo-graph/graphology-adapter'
import { collectNeighborhood } from '@/lib/admin/neo-graph/neighborhood'
import type {
  DoxaGraphProjection,
  NeoGraphFilters,
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

function GraphLifecycle({
  projection,
  filters,
  colorRevision,
  selectedNodeId,
  focusNodeId,
  layoutTick,
  onSelectionChange,
  onGraphStats,
  onHoverLabel,
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  colorRevision: string
  selectedNodeId: string | null
  focusNodeId: string | null
  layoutTick: number
  onSelectionChange: (selection: NeoSelection) => void
  onGraphStats: (stats: {
    nodes: number
    edges: number
    truncated: boolean
  }) => void
  onHoverLabel: (label: string | null) => void
}) {
  const sigma = useSigma()
  const loadGraph = useLoadGraph()
  const setSettings = useSetSettings()
  const registerEvents = useRegisterEvents()
  const { gotoNode, reset, zoomIn, zoomOut } = useCamera({ duration: 400 })
  const graphRef = useRef<NeoSigmaGraph | null>(null)
  const selectedRef = useRef<string | null>(selectedNodeId)
  selectedRef.current = selectedNodeId

  const { start, stop, kill } = useWorkerLayoutForceAtlas2({
    settings: {
      slowDown: 3,
      gravity: 1.1,
      scalingRatio: 8,
      barnesHutOptimize: true,
    },
  })

  const built = useMemo(() => {
    void colorRevision
    return buildGraphologyFromProjection(projection, filters)
  }, [projection, filters, colorRevision])

  useEffect(() => {
    graphRef.current = built.graph
    loadGraph(built.graph)
    onGraphStats({
      nodes: built.nodeCount,
      edges: built.edgeCount,
      truncated: built.truncated,
    })
    start()
    const timer = window.setTimeout(() => stop(), 2800)
    return () => {
      window.clearTimeout(timer)
      stop()
    }
    // intentionally re-run on built identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built])

  useEffect(() => {
    return () => {
      kill()
    }
  }, [kill])

  useEffect(() => {
    if (layoutTick === 0) return
    start()
    const timer = window.setTimeout(() => stop(), 2500)
    return () => window.clearTimeout(timer)
  }, [layoutTick, start, stop])

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
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
      },
      enterNode: ({ node }) => {
        const g = sigma.getGraph()
        const attrs = g.getNodeAttributes(node) as SigmaNodeAttributes
        onHoverLabel(`${attrs.kind}: ${attrs.fullLabel}`)
        sigma.refresh()
      },
      leaveNode: () => {
        onHoverLabel(null)
        sigma.refresh()
      },
      enterEdge: ({ edge }) => {
        const g = sigma.getGraph()
        const attrs = g.getEdgeAttributes(edge) as SigmaEdgeAttributes
        const [source, target] = g.extremities(edge)
        const sLabel = (g.getNodeAttributes(source) as SigmaNodeAttributes).label
        const tLabel = (g.getNodeAttributes(target) as SigmaNodeAttributes).label
        onHoverLabel(`${attrs.edgeType}: ${sLabel} → ${tLabel}`)
        sigma.refresh()
      },
      leaveEdge: () => {
        onHoverLabel(null)
        sigma.refresh()
      },
    })
  }, [onHoverLabel, onSelectionChange, registerEvents, sigma])

  useEffect(() => {
    setSettings({
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      labelDensity: 0.15,
      labelGridCellSize: 80,
      labelRenderedSizeThreshold: 8,
      labelColor: {
        attribute: 'labelColor',
        color: NEO_LABEL_COLOR_IDLE,
      },
      defaultDrawNodeHover: drawNeoNodeHover,
      defaultEdgeType: 'curvedArrow',
      edgeProgramClasses: {
        curvedArrow: EdgeCurvedArrowProgram,
      },
      zIndex: true,
      nodeReducer: (node, data) => {
        const g = sigma.getGraph()
        const selected = selectedRef.current
        const res = { ...data }
        if (!selected) {
          res.forceLabel = data.kind === 'document' || data.kind === 'agent'
          res.labelColor = NEO_LABEL_COLOR_IDLE
          return res
        }
        const { nodes } = collectNeighborhood(g as NeoSigmaGraph, selected)
        if (node === selected) {
          res.highlighted = true
          res.forceLabel = true
          res.size = (data.size ?? 8) * 1.35
          res.zIndex = 2
          res.labelColor = NEO_LABEL_COLOR_EMPHASIS
        } else if (nodes.has(node)) {
          res.forceLabel = true
          res.zIndex = 1
          res.labelColor = NEO_LABEL_COLOR_EMPHASIS
        } else {
          res.color = '#3a3a3a'
          res.labelColor = NEO_LABEL_COLOR_DIMMED
          res.zIndex = 0
        }
        return res
      },
      edgeReducer: (edge, data) => {
        const g = sigma.getGraph()
        const selected = selectedRef.current
        const res = { ...data }
        if (!selected) return res
        const { edges } = collectNeighborhood(g as NeoSigmaGraph, selected)
        if (edges.has(edge)) {
          res.size = 2.2
          res.zIndex = 1
          res.color = data.color
        } else {
          res.hidden = false
          res.color = '#2a2a2a'
          res.size = 0.6
        }
        return res
      },
    })
  }, [setSettings, sigma, selectedNodeId])

  useEffect(() => {
    if (focusNodeId && sigma.getGraph().hasNode(focusNodeId)) {
      gotoNode(focusNodeId, { duration: 450 })
    }
  }, [focusNodeId, gotoNode, sigma])

  // Expose camera helpers via custom events on window for sibling controls — avoid; use context instead.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail === 'zoomIn') zoomIn()
      if (detail === 'zoomOut') zoomOut()
      if (detail === 'reset') reset()
      if (detail === 'fit') reset()
    }
    window.addEventListener('neo-graph-camera', handler)
    return () => window.removeEventListener('neo-graph-camera', handler)
  }, [reset, zoomIn, zoomOut])

  return null
}

export function NeoSigmaCanvas({
  projection,
  filters,
  colorRevision,
  selectedNodeId,
  focusNodeId,
  layoutTick,
  onSelectionChange,
  onGraphStats,
  onHoverLabel,
}: {
  projection: DoxaGraphProjection
  filters: NeoGraphFilters
  colorRevision: string
  selectedNodeId: string | null
  focusNodeId: string | null
  layoutTick: number
  onSelectionChange: (selection: NeoSelection) => void
  onGraphStats: (stats: {
    nodes: number
    edges: number
    truncated: boolean
  }) => void
  onHoverLabel: (label: string | null) => void
}) {
  return (
    <SigmaContainer
      className="h-full w-full !bg-[#121212]"
      style={{ height: '100%', width: '100%', background: '#121212' }}
      settings={{
        allowInvalidContainer: true,
        defaultEdgeType: 'curvedArrow',
        labelColor: {
          attribute: 'labelColor',
          color: NEO_LABEL_COLOR_IDLE,
        },
        defaultDrawNodeHover: drawNeoNodeHover,
        edgeProgramClasses: {
          curvedArrow: EdgeCurvedArrowProgram,
        },
      }}
    >
      <GraphLifecycle
        projection={projection}
        filters={filters}
        colorRevision={colorRevision}
        selectedNodeId={selectedNodeId}
        focusNodeId={focusNodeId}
        layoutTick={layoutTick}
        onSelectionChange={onSelectionChange}
        onGraphStats={onGraphStats}
        onHoverLabel={onHoverLabel}
      />
      <ControlsContainer position="bottom-right">
        <ZoomControl />
      </ControlsContainer>
    </SigmaContainer>
  )
}

export { EMPTY_SELECTION }
