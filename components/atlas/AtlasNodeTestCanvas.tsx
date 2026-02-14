'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
// @ts-expect-error -- d3-force-3d ships no type declarations; used as a drop-in d3-force
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d'
import type { VizNode, VizEdge } from './types'

interface AtlasNodeTestCanvasProps {
  /** The thesis node to center on */
  thesisNode: VizNode | null
  /** All nodes in the map (we'll filter for claims linked to the thesis) */
  nodes: VizNode[]
  /** All edges in the map (we'll filter for thesis↔claim links) */
  edges: VizEdge[]
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

function getBaseColor(node: VizNode): string {
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

function getEdgeColor(): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return isDark ? 'rgba(176,176,176,0.35)' : 'rgba(74,69,57,0.35)'
}

function getBgColor(): string {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return isDark ? '#1a1a1a' : '#e8e5e1'
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

export default function AtlasNodeTestCanvas({ thesisNode, nodes, edges }: AtlasNodeTestCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)
  const [showSliders, setShowSliders] = useState(false)

  // Visual controls — thesis is always 1.5x the node radius
  const [nodeRadius, setNodeRadius] = useState(DEFAULT_NODE_RADIUS)
  const claimRadius = nodeRadius
  const thesisRadius = Math.round(nodeRadius * 1.5)

  // Force controls
  const [linkDistance, setLinkDistance] = useState(DEFAULT_LINK_DISTANCE)
  const [linkStrength, setLinkStrength] = useState(DEFAULT_LINK_STRENGTH)
  const [chargeStrength, setChargeStrength] = useState(DEFAULT_CHARGE_STRENGTH)

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
      ctx.fillText('No thesis node loaded', canvas.width / 2, canvas.height / 2)
      return
    }

    // Build a quick lookup from id -> simNode position
    const posMap = new Map<string, { x: number; y: number }>()
    for (const sn of sNodes) {
      posMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
    }

    // Find thesis for edge drawing
    const thesisDrawn = all.find((dn) => dn.vizNode.entity_type === 'thesis')
    const thesisPos = thesisDrawn ? posMap.get(thesisDrawn.id) : null

    // Draw edges (behind nodes)
    if (thesisPos) {
      ctx.strokeStyle = getEdgeColor()
      ctx.lineWidth = 1.5
      for (const dn of all) {
        if (dn === thesisDrawn) continue
        const pos = posMap.get(dn.id)
        if (!pos) continue
        ctx.beginPath()
        ctx.moveTo(thesisPos.x, thesisPos.y)
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

      // Border
      const defaultBorder = isDark ? [255, 255, 255, 0.15] : [0, 0, 0, 0.2]
      const hoverBorder = isDark ? [203, 213, 225, 0.9] : [71, 85, 105, 0.9]
      const t = a.borderAlpha
      const br = defaultBorder[0] + (hoverBorder[0] - defaultBorder[0]) * t
      const bg = defaultBorder[1] + (hoverBorder[1] - defaultBorder[1]) * t
      const bb = defaultBorder[2] + (hoverBorder[2] - defaultBorder[2]) * t
      const ba = (defaultBorder[3] as number) + ((hoverBorder[3] as number) - (defaultBorder[3] as number)) * t
      ctx.strokeStyle = `rgba(${Math.round(br)},${Math.round(bg)},${Math.round(bb)},${ba.toFixed(2)})`
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

    if (!thesisNode) {
      drawnNodes.current = []
      simNodes.current = []
      simLinks.current = []
      drawFrame()
      return
    }

    const thesis = thesisNode
    const thesisId = `${thesis.entity_type}:${thesis.entity_id}`
    const cx = canvasWidth / 2
    const cy = CANVAS_HEIGHT / 2

    // Find claims linked to this thesis, ranked by similarity to the thesis centroid
    const MAX_CLAIMS = 12
    const claimEdges: { claimId: string; similarity: number }[] = []
    for (const e of edges) {
      if (e.source_type === 'thesis' && e.source_id === thesis.entity_id && e.target_type === 'claim') {
        claimEdges.push({ claimId: e.target_id, similarity: e.similarity_score ?? 0 })
      }
      if (e.target_type === 'thesis' && e.target_id === thesis.entity_id && e.source_type === 'claim') {
        claimEdges.push({ claimId: e.source_id, similarity: e.similarity_score ?? 0 })
      }
    }
    // Sort by similarity descending, take top 12
    claimEdges.sort((a, b) => b.similarity - a.similarity)
    const topClaimIds = new Set(claimEdges.slice(0, MAX_CLAIMS).map((c) => c.claimId))

    const claimVizNodes = nodes.filter(
      (n) => n.entity_type === 'claim' && topClaimIds.has(n.entity_id)
    )

    // Preserve existing positions from old sim nodes
    const oldPosMap = new Map<string, { x: number; y: number }>()
    for (const sn of simNodes.current) {
      oldPosMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
    }

    // Build DrawnNodes
    const newDrawn: DrawnNode[] = []
    const oldDrawnMap = new Map<string, DrawnNode>()
    for (const dn of drawnNodes.current) oldDrawnMap.set(dn.id, dn)

    const oldThesis = oldDrawnMap.get(thesisId)
    newDrawn.push({
      vizNode: thesis,
      id: thesisId,
      radius: thesisRadius,
      hovered: oldThesis?.hovered ?? false,
      dragging: oldThesis?.dragging ?? false,
      anim: oldThesis?.anim ?? defaultAnim(),
    })

    const claimCount = claimVizNodes.length
    claimVizNodes.forEach((claim, i) => {
      const claimId = `${claim.entity_type}:${claim.entity_id}`
      const old = oldDrawnMap.get(claimId)
      newDrawn.push({
        vizNode: claim,
        id: claimId,
        radius: claimRadius,
        hovered: old?.hovered ?? false,
        dragging: old?.dragging ?? false,
        anim: old?.anim ?? defaultAnim(),
      })
      // Pre-calculate initial orbit position if no old position exists
      if (!oldPosMap.has(claimId)) {
        const angle = (2 * Math.PI * i) / claimCount - Math.PI / 2
        oldPosMap.set(claimId, {
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

    // Build SimLinks (thesis <-> each claim)
    const newSimLinks: SimLink[] = newDrawn
      .filter((dn) => dn.vizNode.entity_type === 'claim')
      .map((dn) => ({
        source: thesisId,
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
  }, [thesisNode, nodes, edges, canvasWidth, nodeRadius])

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

      // Handle active drag: update the fixed position in the simulation
      const draggingSim = sNodes.find((sn) => sn.drawnNode.dragging)
      if (draggingSim) {
        const r = draggingSim.drawnNode.radius
        const cw = canvasWidthRef.current
        draggingSim.fx = Math.max(r, Math.min(cw - r, mx))
        draggingSim.fy = Math.max(r, Math.min(CANVAS_HEIGHT - r, my))
        // Keep the simulation alive while the user is actively dragging
        if (simulationRef.current) {
          simulationRef.current.alpha(0.3).restart()
        }
        return
      }

      // Update hover states
      const hit = findNodeAt(mx, my)
      let changed = false
      for (const sn of sNodes) {
        const shouldHover = sn === hit
        if (sn.drawnNode.hovered !== shouldHover) {
          sn.drawnNode.hovered = shouldHover
          changed = true
        }
      }
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
        hit.drawnNode.dragging = true
        // Fix the node's position in the simulation (clamped to canvas)
        const r = hit.drawnNode.radius
        const cw = canvasWidthRef.current
        hit.fx = Math.max(r, Math.min(cw - r, mx))
        hit.fy = Math.max(r, Math.min(CANVAS_HEIGHT - r, my))
        // Reheat the simulation so other nodes react
        if (simulationRef.current) {
          simulationRef.current.alpha(0.3).restart()
        }
        startAnim()
      }
    },
    [findNodeAt, startAnim]
  )

  const handleMouseUp = useCallback(() => {
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
    if (changed) {
      // Give a small reheat so nodes settle naturally
      if (simulationRef.current) {
        simulationRef.current.alpha(0.1).restart()
      }
      startAnim()
    }
  }, [startAnim])

  const handleMouseLeave = useCallback(() => {
    let changed = false
    for (const sn of simNodes.current) {
      if (sn.drawnNode.hovered || sn.drawnNode.dragging) {
        sn.drawnNode.hovered = false
        if (sn.drawnNode.dragging) {
          sn.drawnNode.dragging = false
          sn.fx = null
          sn.fy = null
        }
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
            Node size
            <input
              type="range"
              min={4}
              max={11}
              step={0.5}
              value={nodeRadius}
              onChange={(e) => setNodeRadius(Number(e.target.value))}
              className="w-32"
            />
          </label>
          <hr className="border-[var(--border-subtle)]" />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Link distance
            <input
              type="range"
              min={20}
              max={90}
              step={2}
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
              min={-15}
              max={0}
              step={1}
              value={chargeStrength}
              onChange={(e) => setChargeStrength(Number(e.target.value))}
              className="w-32"
            />
          </label>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={CANVAS_HEIGHT}
        className="w-full rounded-bevel"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  )
}
