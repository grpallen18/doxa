'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { VizNode, VizEdge } from './types'
import type { ForceGraphMethods } from 'react-force-graph-2d'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface AtlasForceGraphProps {
  nodes: VizNode[]
  edges?: VizEdge[]
  onNodeClick?: (node: VizNode) => void
  onBackgroundClick?: () => void
  selectedNodeId?: string | null
}

const MIN_RADIUS = 3
const MAX_RADIUS = 12
const SIZE_SCALE = 4

const DEFAULT_CENTER_STRENGTH = 0.1
const DEFAULT_LINK_DISTANCE = 80
const DEFAULT_LINK_STRENGTH = 0.5
const DEFAULT_CHARGE_STRENGTH = -100

// Canvas doesn't resolve CSS variables - use theme-aware hex colors (match globals.css)
function getNodeFillColor(node: VizNode): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const score = node.polarity_score
  if (node.entity_type === 'thesis') {
    if (score != null && score > 0) return isDark ? '#2dd4bf' : '#0d9488'
    if (score != null && score < 0) return '#dc2626'
    return isDark ? '#22d3ee' : '#0f766e'
  }
  if (score != null && score > 0) return isDark ? '#22c55e' : '#4ade80'
  if (score != null && score < 0) return isDark ? '#fb7185' : '#f87171'
  return '#94a3b8'
}

function getNodeStrokeColor(selected: boolean): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return selected ? (isDark ? '#cbd5e1' : '#475569') : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)')
}

function getAtlasBgColor(): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return isDark ? '#1a1a1a' : '#e8e5e1'
}

function getAtlasEdgeColor(): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return isDark ? 'rgba(176,176,176,0.35)' : 'rgba(74,69,57,0.35)'
}

function getBubbleRadius(node: VizNode): number {
  const base = 2 + (node.size ?? 1) * SIZE_SCALE
  const radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, base))
  if (node.entity_type === 'claim') {
    return Math.max(MIN_RADIUS * 0.5, radius * 0.5)
  }
  return radius
}

export default function AtlasForceGraph({
  nodes,
  edges = [],
  onNodeClick,
  onBackgroundClick,
  selectedNodeId,
}: AtlasForceGraphProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [centerStrength, setCenterStrength] = useState(DEFAULT_CENTER_STRENGTH)
  const [linkDistance, setLinkDistance] = useState(DEFAULT_LINK_DISTANCE)
  const [linkStrength, setLinkStrength] = useState(DEFAULT_LINK_STRENGTH)
  const [chargeStrength, setChargeStrength] = useState(DEFAULT_CHARGE_STRENGTH)
  const [showSliders, setShowSliders] = useState(false)

  const graphData = useMemo(() => {
    const nodeId = (n: VizNode) => `${n.entity_type}:${n.entity_id}`
    const fgNodes = nodes.map((n) => ({
      id: nodeId(n),
      ...n,
    }))
    const fgLinks = (edges ?? [])
      .filter(
        (e) =>
          (e.source_type === 'thesis' && e.target_type === 'claim') ||
          (e.source_type === 'claim' && e.target_type === 'thesis')
      )
      .map((e) => ({
        source: `${e.source_type}:${e.source_id}`,
        target: `${e.target_type}:${e.target_id}`,
        ...e,
      }))
    return { nodes: fgNodes, links: fgLinks }
  }, [nodes, edges])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width: Math.floor(width), height: Math.floor(height) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const graph = graphRef.current
      if (!graph) return
      const linkForce = graph.d3Force('link') as { distance?: (v: number) => unknown; strength?: (v: number) => unknown } | undefined
      const chargeForce = graph.d3Force('charge') as { strength?: (v: number) => unknown } | undefined
      const centerForce = graph.d3Force('center') as { strength?: (v: number) => unknown } | undefined
      if (linkForce) {
        linkForce.distance?.(linkDistance)
        linkForce.strength?.(linkStrength)
      }
      if (chargeForce) chargeForce.strength?.(chargeStrength)
      if (centerForce) centerForce.strength?.(centerStrength)
      graph.d3ReheatSimulation?.()
    })
    return () => cancelAnimationFrame(id)
  }, [centerStrength, linkDistance, linkStrength, chargeStrength, graphData.nodes.length])

  const handleNodeClick = useCallback(
    (node: Record<string, unknown>, _event: MouseEvent) => {
      if (!onNodeClick) return
      const id = String(node.id ?? '')
      const vizNode = nodes.find((n) => `${n.entity_type}:${n.entity_id}` === id)
      if (vizNode) onNodeClick(vizNode)
    },
    [onNodeClick, nodes]
  )

  const handleBackgroundClick = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('button')) return
      onBackgroundClick?.()
    },
    [onBackgroundClick]
  )

  const nodeColor = useCallback((node: Record<string, unknown>) => getNodeFillColor(node as unknown as VizNode), [])

  const nodeVal = useCallback((node: Record<string, unknown>) => getBubbleRadius(node as unknown as VizNode), [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden rounded-bevel"
      style={{ backgroundColor: 'var(--atlas-bg)' }}
    >
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSliders((s) => !s)}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-1.5 text-sm text-foreground shadow-[var(--shadow-panel-soft)] hover:bg-[var(--surface-soft)]"
        >
          {showSliders ? 'Hide' : 'Show'} layout controls
        </button>
      </div>
      {showSliders && (
        <div className="absolute left-3 top-12 z-10 flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] p-3 shadow-[var(--shadow-panel-soft)]">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Center strength
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={centerStrength}
              onChange={(e) => setCenterStrength(Number(e.target.value))}
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Link distance
            <input
              type="range"
              min={20}
              max={200}
              step={5}
              value={linkDistance}
              onChange={(e) => setLinkDistance(Number(e.target.value))}
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Link strength
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={linkStrength}
              onChange={(e) => setLinkStrength(Number(e.target.value))}
              className="w-32"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Repel (charge)
            <input
              type="range"
              min={-300}
              max={0}
              step={10}
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-32"
            />
          </label>
        </div>
      )}
      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width || 800}
        height={dimensions.height || 500}
        graphData={graphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeColor={nodeColor}
        nodeVal={nodeVal}
        nodeCanvasObjectMode="replace"
        linkColor={() => getAtlasEdgeColor()}
        linkWidth={1}
        backgroundColor={getAtlasBgColor()}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        showPointerCursor={(obj) => !!obj}
        enableNodeDrag
        enablePanInteraction={false}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const id = node.id as string
          const vizNode = nodes.find((n) => `${n.entity_type}:${n.entity_id}` === id)
          if (!vizNode) return
          const radius = getBubbleRadius(vizNode) / globalScale
          const selected = selectedNodeId === id
          const pointerMultiplier = vizNode.entity_type === 'claim' ? 7 : 4.5
          ;(node as Record<string, unknown>).__pointerRadius = radius * pointerMultiplier
          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, selected ? radius * 1.15 : radius, 0, 2 * Math.PI)
          ctx.fillStyle = getNodeFillColor(vizNode)
          ctx.fill()
          ctx.strokeStyle = getNodeStrokeColor(selected)
          ctx.lineWidth = selected ? 2 : 1
          ctx.stroke()
        }}
        nodePointerAreaPaint={(node, color, ctx, globalScale) => {
          const id = node.id as string
          const vizNode = nodes.find((n) => `${n.entity_type}:${n.entity_id}` === id)
          const visualRadius = vizNode ? getBubbleRadius(vizNode) / globalScale : 8 / globalScale
          const pointerMultiplier = vizNode?.entity_type === 'claim' ? 7 : 4.5
          const pointerRadius = (node as Record<string, unknown>).__pointerRadius as number | undefined ?? visualRadius * pointerMultiplier
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, pointerRadius, 0, 2 * Math.PI)
          ctx.fill()
        }}
      />
    </div>
  )
}
