'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
// @ts-expect-error -- d3-force-3d ships no type declarations; used as a drop-in d3-force
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d'
import type { VizNode } from './types'
import type { SourceDetail } from './types'

interface AtlasNodeTestCanvasProps {
  /** The center node (thesis or viewpoint) to center on */
  centerNode: VizNode | null
  /** Sources (from top 20 claims grouped by source) */
  sourceDetails: SourceDetail[]
  /** When set, the source node with this source_id is shown as hovered (synced from content panel) */
  hoveredSourceId?: string | null
  /** Called when the user hovers a source node (so the content panel can highlight the card) */
  onHoveredSourceChange?: (sourceId: string | null) => void
  /** Called when the user clicks a source node (without dragging) to expand its accordion */
  onSourceSelect?: (sourceId: string | null) => void
}

const DEFAULT_NODE_RADIUS = 14
const CANVAS_HEIGHT = 400
const LERP_SPEED = 0.10
const GLOW_SPREAD = 5
const HOVER_SCALE = 1.10
const HOVER_BRIGHTNESS = 1.18
const ORBIT_DISTANCE = 120

// Force defaults (match the main graph)
const DEFAULT_LINK_DISTANCE = 80
const DEFAULT_LINK_STRENGTH = 0.5
const DEFAULT_CHARGE_STRENGTH = -10

// ---- Node / edge / background colors ----
// Each entry is [dark mode, light mode]
const COLORS = {
  // Thesis node
  thesisPositive:  ['#2dd4bf', '#0d9488'] as [string, string],
  thesisNegative:  ['#dc2626', '#dc2626'] as [string, string],
  thesisNeutral:   ['#22d3ee', '#0f766e'] as [string, string],
  // Claim / source node (tan brown, matches Doxa palette)
  claimPositive:   ['#9a8a7a', '#a68b6d'] as [string, string],
  claimNegative:   ['#9a8a7a', '#a68b6d'] as [string, string],
  claimNeutral:    ['#9a8a7a', '#a68b6d'] as [string, string],
  // Edges connecting nodes
  edge:            ['rgba(176,176,176,0.35)', 'rgba(74,69,57,0.35)'] as [string, string],
  // Canvas background
  background:      ['#1a1a1a', '#e8e5e1'] as [string, string],
  // Node borders (dark complements to fill colors)
  claimBorder:     ['#5a4a3a', '#7a6a52'] as [string, string],
  thesisBorder:    ['#0a6b5e', '#065f54'] as [string, string],   // darker green to complement thesis teal
}

// ---- Helpers ----

function lerp(current: number, target: number, speed: number): number {
  return current + (target - current) * speed
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function brighten(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.min(255, Math.round(rgb[0] * factor)),
    Math.min(255, Math.round(rgb[1] * factor)),
    Math.min(255, Math.round(rgb[2] * factor)),
  ]
}

function rgbStr(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
}

/** Pick the dark or light variant based on the current theme */
function pick(pair: [string, string]): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return isDark ? pair[0] : pair[1]
}

function getBaseColor(node: VizNode): string {
  const score = node.polarity_score
  if (node.entity_type === 'thesis' || node.entity_type === 'viewpoint') {
    if (score != null && score > 0) return pick(COLORS.thesisPositive)
    if (score != null && score < 0) return pick(COLORS.thesisNegative)
    return pick(COLORS.thesisNeutral)
  }
  // Claim and source nodes use accent-secondary
  if (score != null && score > 0) return pick(COLORS.claimPositive)
  if (score != null && score < 0) return pick(COLORS.claimNegative)
  return pick(COLORS.claimNeutral)
}

function getEdgeColor(): string {
  return pick(COLORS.edge)
}

function getBgColor(): string {
  return pick(COLORS.background)
}

// ---- Per-node animated state (hover/drag visual effects) ----

interface AnimState {
  scale: number
  glowOpacity: number
  borderWidth: number
  borderAlpha: number
  brightness: number
}

function defaultAnim(): AnimState {
  return { scale: 1, glowOpacity: 0, borderWidth: 2, borderAlpha: 1, brightness: 1 }
}

/** Each drawn node tracks its own interaction state and animation */
interface DrawnNode {
  vizNode: VizNode
  id: string
  radius: number
  hovered: boolean
  dragging: boolean
  anim: AnimState
}

/** The d3-force simulation operates on SimNode objects (has x, y, vx, vy, fx, fy) */
interface SimNode {
  id: string
  x: number
  y: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  drawnNode: DrawnNode
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
}

/** Clamp a sim node so its visible circle stays fully inside the canvas */
function clampToCanvas(sn: SimNode, cw: number, ch: number) {
  const r = sn.drawnNode.radius
  sn.x = Math.max(r, Math.min(cw - r, sn.x))
  sn.y = Math.max(r, Math.min(ch - r, sn.y))
}

export default function AtlasNodeTestCanvas({
  centerNode,
  sourceDetails,
  hoveredSourceId = null,
  onHoveredSourceChange,
  onSourceSelect,
}: AtlasNodeTestCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)

  // Layout defaults (no user controls)
  const nodeRadius = DEFAULT_NODE_RADIUS
  const claimRadius = nodeRadius
  const thesisRadius = Math.round(nodeRadius * 1.5)
  const linkDistance = DEFAULT_LINK_DISTANCE
  const linkStrength = DEFAULT_LINK_STRENGTH
  const chargeStrength = DEFAULT_CHARGE_STRENGTH

  // Refs for hover sync (avoid stale closures in callbacks)
  const hoveredSourceIdRef = useRef<string | null>(hoveredSourceId)
  hoveredSourceIdRef.current = hoveredSourceId
  const onHoveredSourceChangeRef = useRef(onHoveredSourceChange)
  onHoveredSourceChangeRef.current = onHoveredSourceChange
  const onSourceSelectRef = useRef(onSourceSelect)
  onSourceSelectRef.current = onSourceSelect

  // Track click vs drag: left click = accordion, right click = drag
  const dragStartNodeRef = useRef<SimNode | null>(null)
  const dragButtonRef = useRef<number>(0)
  const hasMovedDuringDragRef = useRef(false)
  const dragOffsetXRef = useRef(0)
  const dragOffsetYRef = useRef(0)
  const preventContextMenuRef = useRef(false)

  // All drawn nodes (thesis + connected claims)
  const drawnNodes = useRef<DrawnNode[]>([])
  // The d3-force simulation nodes (these hold x/y positions that the sim updates)
  const simNodes = useRef<SimNode[]>([])
  const simLinks = useRef<SimLink[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulationRef = useRef<any>(null)

  // Hover animation loop (separate from simulation tick)
  const animFrameId = useRef<number>(0)
  const animRunning = useRef(false)

  // Keep latest props/settings in refs for use inside callbacks
  const canvasWidthRef = useRef(canvasWidth)
  canvasWidthRef.current = canvasWidth

  // ---- Draw everything to the canvas ----
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    ctx.fillStyle = getBgColor()
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const all = drawnNodes.current
    const sNodes = simNodes.current

    // Clamp every node inside the canvas on every single draw
    const cw = canvas.width
    const ch = canvas.height
    for (const sn of sNodes) clampToCanvas(sn, cw, ch)

    if (all.length === 0) {
      ctx.fillStyle = isDark ? '#888' : '#999'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No center node loaded', canvas.width / 2, canvas.height / 2)
      return
    }

    // Build a quick lookup from id -> simNode position
    const posMap = new Map<string, { x: number; y: number }>()
    for (const sn of sNodes) {
      posMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
    }

    // Find center node (thesis or viewpoint) for edge drawing
    const centerDrawn = all.find((dn) => dn.vizNode.entity_type === 'thesis' || dn.vizNode.entity_type === 'viewpoint')
    const centerPos = centerDrawn ? posMap.get(centerDrawn.id) : null

    // Draw edges (behind nodes)
    if (centerPos) {
      ctx.strokeStyle = getEdgeColor()
      ctx.lineWidth = 1.5
      for (const dn of all) {
        if (dn === centerDrawn) continue
        const pos = posMap.get(dn.id)
        if (!pos) continue
        ctx.beginPath()
        ctx.moveTo(centerPos.x, centerPos.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      }
    }

    // Draw each node
    for (const dn of all) {
      const pos = posMap.get(dn.id)
      if (!pos) continue
      const a = dn.anim
      const radius = dn.radius * a.scale
      const baseRgb = hexToRgb(getBaseColor(dn.vizNode))
      const { x, y } = pos

      // Glow ring
      if (a.glowOpacity > 0.01) {
        ctx.beginPath()
        ctx.arc(x, y, radius + GLOW_SPREAD, 0, 2 * Math.PI)
        const glowAlpha = (isDark ? 0.45 : 0.35) * a.glowOpacity
        const glowRgb = brighten(baseRgb, 1.5)
        ctx.fillStyle = `rgba(${glowRgb[0]},${glowRgb[1]},${glowRgb[2]},${glowAlpha})`
        ctx.fill()
      }

      // Node circle
      const litRgb = brighten(baseRgb, a.brightness)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = rgbStr(litRgb)
      ctx.fill()

      // Border (node-type specific; fades out on hover)
      const borderHex = (dn.vizNode.entity_type === 'thesis' || dn.vizNode.entity_type === 'viewpoint')
        ? pick(COLORS.thesisBorder)
        : pick(COLORS.claimBorder)
      const borderRgb = hexToRgb(borderHex)
      const borderAlpha = a.borderAlpha // 1 when idle, 0 when hovered
      ctx.strokeStyle = `rgba(${borderRgb[0]},${borderRgb[1]},${borderRgb[2]},${borderAlpha.toFixed(2)})`
      ctx.lineWidth = a.borderWidth
      if (a.borderWidth > 0.1) ctx.stroke()
    }

    // Cursor
    const anyHovered = all.some((dn) => dn.hovered)
    const anyDragging = all.some((dn) => dn.dragging)
    canvas.style.cursor = anyDragging ? 'grabbing' : anyHovered ? 'grab' : 'default'
  }, [])

  // ---- Get animation targets for a node ----
  function getTargets(dn: DrawnNode): AnimState {
    if (dn.dragging) {
      return { scale: 0.94, glowOpacity: 0, borderWidth: 1.5, borderAlpha: 0.4, brightness: 0.95 }
    }
    if (dn.hovered) {
      return { scale: HOVER_SCALE, glowOpacity: 1, borderWidth: 0, borderAlpha: 0, brightness: HOVER_BRIGHTNESS }
    }
    return { scale: 1, glowOpacity: 0, borderWidth: 2, borderAlpha: 1, brightness: 1 }
  }

  // ---- Lerp all hover/drag animations one step, returns true if any still moving ----
  const lerpAnimations = useCallback((): boolean => {
    let anyMoving = false
    for (const dn of drawnNodes.current) {
      const targets = getTargets(dn)
      const a = dn.anim
      a.scale = lerp(a.scale, targets.scale, LERP_SPEED)
      a.glowOpacity = lerp(a.glowOpacity, targets.glowOpacity, LERP_SPEED)
      a.borderWidth = lerp(a.borderWidth, targets.borderWidth, LERP_SPEED)
      a.borderAlpha = lerp(a.borderAlpha, targets.borderAlpha, LERP_SPEED)
      a.brightness = lerp(a.brightness, targets.brightness, LERP_SPEED)

      const settled =
        Math.abs(a.scale - targets.scale) < 0.002 &&
        Math.abs(a.glowOpacity - targets.glowOpacity) < 0.005 &&
        Math.abs(a.borderWidth - targets.borderWidth) < 0.01 &&
        Math.abs(a.borderAlpha - targets.borderAlpha) < 0.005 &&
        Math.abs(a.brightness - targets.brightness) < 0.002

      if (settled) {
        Object.assign(a, targets)
      } else {
        anyMoving = true
      }
    }
    return anyMoving
  }, [])

  // ---- Hover animation loop (runs only when hover/drag animations are transitioning) ----
  const animTick = useCallback(() => {
    const stillMoving = lerpAnimations()
    drawFrame()
    if (stillMoving) {
      animFrameId.current = requestAnimationFrame(animTick)
    } else {
      animRunning.current = false
    }
  }, [lerpAnimations, drawFrame])

  const startAnim = useCallback(() => {
    if (animRunning.current) return
    animRunning.current = true
    animFrameId.current = requestAnimationFrame(animTick)
  }, [animTick])

  // ---- Build simulation whenever data changes ----
  useEffect(() => {
    // Stop any existing simulation
    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }

    if (!centerNode) {
      drawnNodes.current = []
      simNodes.current = []
      simLinks.current = []
      drawFrame()
      return
    }

    const center = centerNode
    const centerId = `${center.entity_type}:${center.entity_id}`
    const cx = canvasWidth / 2
    const cy = CANVAS_HEIGHT / 2

    // Build source nodes from sourceDetails (already sorted by claim_count)
    const sources = sourceDetails ?? []

    // Preserve existing positions from old sim nodes
    const oldPosMap = new Map<string, { x: number; y: number }>()
    for (const sn of simNodes.current) {
      oldPosMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
    }

    // Build DrawnNodes
    const newDrawn: DrawnNode[] = []
    const oldDrawnMap = new Map<string, DrawnNode>()
    for (const dn of drawnNodes.current) oldDrawnMap.set(dn.id, dn)

    const oldCenter = oldDrawnMap.get(centerId)
    newDrawn.push({
      vizNode: center,
      id: centerId,
      radius: thesisRadius,
      hovered: oldThesis?.hovered ?? false,
      dragging: oldThesis?.dragging ?? false,
      anim: oldThesis?.anim ?? defaultAnim(),
    })

    const sourceCount = sources.length
    sources.forEach((src, i) => {
      const sourceId = `source:${src.source_id}`
      const syntheticNode: VizNode = {
        map_id: '',
        entity_type: 'source',
        entity_id: src.source_id,
        layer: 2,
        size: 1,
      }
      const old = oldDrawnMap.get(sourceId)
      newDrawn.push({
        vizNode: syntheticNode,
        id: sourceId,
        radius: claimRadius,
        hovered: old?.hovered ?? false,
        dragging: old?.dragging ?? false,
        anim: old?.anim ?? defaultAnim(),
      })
      if (!oldPosMap.has(sourceId)) {
        const angle = (2 * Math.PI * i) / sourceCount - Math.PI / 2
        oldPosMap.set(sourceId, {
          x: cx + Math.cos(angle) * ORBIT_DISTANCE,
          y: cy + Math.sin(angle) * ORBIT_DISTANCE,
        })
      }
    })

    drawnNodes.current = newDrawn

    // Build SimNodes
    const newSimNodes: SimNode[] = newDrawn.map((dn) => {
      const oldPos = oldPosMap.get(dn.id)
      return {
        id: dn.id,
        x: oldPos?.x ?? cx,
        y: oldPos?.y ?? cy,
        drawnNode: dn,
      }
    })
    simNodes.current = newSimNodes

    // Build SimLinks (center <-> each source)
    const newSimLinks: SimLink[] = newDrawn
      .filter((dn) => dn.vizNode.entity_type === 'source')
      .map((dn) => ({
        source: centerId,
        target: dn.id,
      }))
    simLinks.current = newSimLinks

    // Create the d3-force simulation
    const sim = forceSimulation(newSimNodes, 2)
      .force(
        'link',
        forceLink<SimNode, SimLink>(newSimLinks)
          .id((d: SimNode) => d.id)
          .distance(linkDistance)
          .strength(linkStrength)
      )
      .force('charge', forceManyBody().strength(chargeStrength))
      .alphaDecay(0.02)
      .on('tick', () => {
        // Lerp hover animations each physics tick; drawFrame clamps all nodes
        lerpAnimations()
        drawFrame()
      })

    simulationRef.current = sim

    return () => {
      sim.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerNode, sourceDetails, canvasWidth, nodeRadius])

  // ---- Reconfigure forces when slider values change (without rebuilding nodes) ----
  useEffect(() => {
    const sim = simulationRef.current
    if (!sim) return

    const lf = sim.force('link')
    if (lf) {
      lf.distance(linkDistance)
      lf.strength(linkStrength)
    }
    const cf = sim.force('charge')
    if (cf) cf.strength(chargeStrength)

    // Reheat so the changes take effect
    sim.alpha(0.3).restart()
  }, [linkDistance, linkStrength, chargeStrength])

  // Sync hoveredSourceId from content panel into node hover states
  useEffect(() => {
    const sNodes = simNodes.current
    const id = hoveredSourceId
    let changed = false
    for (const sn of sNodes) {
      const isSource = sn.drawnNode.vizNode.entity_type === 'source'
      const shouldHover = isSource && sn.drawnNode.vizNode.entity_id === id
      if (sn.drawnNode.hovered !== shouldHover) {
        sn.drawnNode.hovered = shouldHover
        changed = true
      }
    }
    if (changed) startAnim()
  }, [hoveredSourceId, startAnim])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameId.current)
      if (simulationRef.current) simulationRef.current.stop()
    }
  }, [])

  // Resize canvas
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(Math.floor(entry.contentRect.width))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- Hit-test: find which node the mouse is over ----
  const findNodeAt = useCallback((mx: number, my: number): SimNode | null => {
    const sNodes = simNodes.current
    for (let i = sNodes.length - 1; i >= 0; i--) {
      const sn = sNodes[i]
      const dx = mx - (sn.x ?? 0)
      const dy = my - (sn.y ?? 0)
      const hitRadius = sn.drawnNode.radius + 8
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return sn
    }
    return null
  }, [])

  // ---- Mouse handlers (integrated with d3-force simulation) ----
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const sNodes = simNodes.current

      // Handle active drag: update the fixed position in the simulation (preserve grab offset)
      const draggingSim = sNodes.find((sn) => sn.drawnNode.dragging)
      if (draggingSim) {
        hasMovedDuringDragRef.current = true
        const r = draggingSim.drawnNode.radius
        const cw = canvasWidthRef.current
        const nx = mx - dragOffsetXRef.current
        const ny = my - dragOffsetYRef.current
        draggingSim.fx = Math.max(r, Math.min(cw - r, nx))
        draggingSim.fy = Math.max(r, Math.min(CANVAS_HEIGHT - r, ny))
        // Keep the simulation alive while the user is actively dragging
        if (simulationRef.current) {
          simulationRef.current.alpha(0.3).restart()
        }
        return
      }

      // Update hover states (merge canvas hit + hoveredSourceId from content panel)
      const hit = findNodeAt(mx, my)
      const extId = hoveredSourceIdRef.current
      let changed = false
      for (const sn of sNodes) {
        const isSource = sn.drawnNode.vizNode.entity_type === 'source'
        const shouldHover =
          sn === hit || (isSource && sn.drawnNode.vizNode.entity_id === extId)
        if (sn.drawnNode.hovered !== shouldHover) {
          sn.drawnNode.hovered = shouldHover
          changed = true
        }
      }
      const sourceId =
        hit?.drawnNode.vizNode.entity_type === 'source'
          ? hit.drawnNode.vizNode.entity_id
          : null
      onHoveredSourceChangeRef.current?.(sourceId)
      if (changed) startAnim()
    },
    [findNodeAt, startAnim]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const hit = findNodeAt(mx, my)
      if (hit) {
        dragStartNodeRef.current = hit
        dragButtonRef.current = e.button
        hasMovedDuringDragRef.current = false

        // Right click (button 2): start drag
        if (e.button === 2) {
          preventContextMenuRef.current = true
          hit.drawnNode.dragging = true
          const cx = hit.x ?? 0
          const cy = hit.y ?? 0
          dragOffsetXRef.current = mx - cx
          dragOffsetYRef.current = my - cy
          const r = hit.drawnNode.radius
          const cw = canvasWidthRef.current
          hit.fx = Math.max(r, Math.min(cw - r, cx))
          hit.fy = Math.max(r, Math.min(CANVAS_HEIGHT - r, cy))
          if (simulationRef.current) {
            simulationRef.current.alpha(0.3).restart()
          }
          startAnim()
        }
        // Left click (button 0): only accordion on mouseup, no drag setup
      }
    },
    [findNodeAt, startAnim]
  )

  const handleMouseUp = useCallback(() => {
    const startNode = dragStartNodeRef.current
    const didDrag = hasMovedDuringDragRef.current
    dragStartNodeRef.current = null
    hasMovedDuringDragRef.current = false

    let changed = false
    for (const sn of simNodes.current) {
      if (sn.drawnNode.dragging) {
        sn.drawnNode.dragging = false
        // Unfix the node so it can float freely again
        sn.fx = null
        sn.fy = null
        changed = true
      }
    }

    // Left click (no drag) on a source node: open accordion
    if (
      startNode &&
      !didDrag &&
      dragButtonRef.current === 0 &&
      startNode.drawnNode.vizNode.entity_type === 'source'
    ) {
      onSourceSelectRef.current?.(startNode.drawnNode.vizNode.entity_id)
    }

    if (changed) {
      // Give a small reheat so nodes settle naturally
      if (simulationRef.current) {
        simulationRef.current.alpha(0.1).restart()
      }
      startAnim()
    }
  }, [startAnim])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (preventContextMenuRef.current) {
      preventContextMenuRef.current = false
      e.preventDefault()
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    onHoveredSourceChangeRef.current?.(null)
    dragStartNodeRef.current = null
    hasMovedDuringDragRef.current = false
    preventContextMenuRef.current = false
    const extId = hoveredSourceIdRef.current
    let changed = false
    for (const sn of simNodes.current) {
      const isSource = sn.drawnNode.vizNode.entity_type === 'source'
      const shouldHover = isSource && sn.drawnNode.vizNode.entity_id === extId
      if (sn.drawnNode.dragging) {
        sn.drawnNode.dragging = false
        sn.fx = null
        sn.fy = null
        changed = true
      }
      if (sn.drawnNode.hovered !== shouldHover) {
        sn.drawnNode.hovered = shouldHover
        changed = true
      }
    }
    if (changed) {
      if (simulationRef.current) {
        simulationRef.current.alpha(0.1).restart()
      }
      startAnim()
    }
  }, [startAnim])

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={CANVAS_HEIGHT}
        className="w-full rounded-bevel"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      />
    </div>
  )
}
