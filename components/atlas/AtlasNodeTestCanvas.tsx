'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
// @ts-expect-error -- d3-force-3d ships no type declarations; used as a drop-in d3-force
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d'
import { cn } from '@/lib/utils'
import type { VizNode } from './types'
import type { OuterNode } from './types'

interface AtlasNodeTestCanvasProps {
  /** Optional class names for the root container (e.g. min-h-0 flex-1 for flex layout) */
  className?: string
  /** The center node (viewpoint or controversy) to center on */
  centerNode: VizNode | null
  /** Outer nodes (viewpoints, sources, etc.) to orbit around the center */
  outerNodes: OuterNode[]
  /** When set, the outer node with this entity_id is shown as hovered (synced from content panel) */
  hoveredOuterId?: string | null
  /** Called when the user hovers an outer node (so the content panel can highlight) */
  onHoveredOuterChange?: (entityId: string | null) => void
  /** Called when the user clicks an outer node (without dragging). Passes entityType and entityId. */
  onOuterNodeClick?: (entityType: string, entityId: string) => void
  /** Called when the user clicks a drillable node, before the morph starts. Use to prefetch data in parallel. */
  onDrillPrepare?: (entityType: string, entityId: string) => void
  /** When true, canvas runs zoom-out morph (center drifts to outer orbit). Page clears after onZoomOutComplete. */
  pendingZoomOut?: boolean
  /** Called when zoom-out morph finishes so the page can load the parent scope. */
  onZoomOutComplete?: () => void
  /** Scope depth (1 = controversy, 2 = viewpoint, etc.). Nodes scale up when zoomed in. */
  scopeDepth?: number
}

const DEFAULT_NODE_RADIUS = 14
const CANVAS_HEIGHT = 400
const LERP_SPEED = 0.10
const GLOW_SPREAD = 5
const HOVER_SCALE = 1.10
const HOVER_BRIGHTNESS = 1.18
const ORBIT_DISTANCE = 120

// Force defaults (match the main graph)
const DEFAULT_LINK_DISTANCE = 110
const DEFAULT_LINK_STRENGTH = 0.5
const DEFAULT_CHARGE_STRENGTH = -10

// Morph animation (drill-down)
const MORPH_DRIFT_DURATION_MS = 800
const MORPH_FADE_DURATION_MS = 200
const FADE_IN_STAGGER_MS = 300
const FADE_IN_DURATION_MS = 900

// ---- Jitter (internal: edit here to tune; not exposed to users) ----
type JitterTarget = 'all' | 'center' | 'outer'

interface JitterConfig {
  /** Base velocity injection per application (e.g. 0.15) */
  strength: number
  /** Which nodes to apply jitter to */
  target: JitterTarget
  /** Scale strength by entity_type. Unlisted types use 1. */
  typeScale?: Partial<Record<string, number>>
  /** Apply jitter every N ticks (1 = every tick) */
  frequency: number
}

/** Internal: jitter config. Edit here to tune; not exposed to users. Set to null to disable. */
const JITTER_CONFIG: JitterConfig | null = {
  strength: .6,
  target: 'outer',
  typeScale: { viewpoint: 1, source: 0.8, controversy: 0.5, agreement: 0.6, position: 0.7 },
  frequency: 10,
}

/** When alpha drops below this, switch to alphaDecay(0) so sim keeps running for jitter */
const JITTER_ALPHA_THRESHOLD = 0.005
/** Alpha value to hold when in "jitter mode" (low, so link/charge are weak) */
const JITTER_ALPHA_LOW = 0.001

// ---- Node / edge / background colors ----
// Each entry is [dark mode, light mode]
const COLORS = {
  // Center node (viewpoint / controversy) - main fill colors
  centerPositive:  ['#2dd4bf', '#0d9488'] as [string, string],
  centerNegative:  ['#f87171', '#dc2626'] as [string, string],
  centerNeutral:   ['#22d3ee', '#0f766e'] as [string, string],
  // Claim / source node (tan brown, matches Doxa palette)
  claimPositive:   ['#9a8a7a', '#a68b6d'] as [string, string],
  claimNegative:   ['#9a8a7a', '#a68b6d'] as [string, string],
  claimNeutral:    ['#9a8a7a', '#a68b6d'] as [string, string],
  // Edges connecting nodes
  edge:            ['rgba(176,176,176,0.35)', 'rgba(74,69,57,0.35)'] as [string, string],
  // Canvas background
  background:      ['#1a1a1a', '#e8e5e1'] as [string, string],
  // Surface colors for gradient center and border blend
  surfaceSoft:     ['#2a2a2a', '#e8e5e1'] as [string, string],
  surfaceSection:  ['#252525', '#dad6d1'] as [string, string],
  // Node borders (blended with surface - kept for fallback)
  claimBorder:     ['#5a4a3a', '#7a6a52'] as [string, string],
  centerBorder:    ['#0a6b5e', '#065f54'] as [string, string],
}

/** Blend two hex colors: result = c1 * weight + c2 * (1 - weight) */
function blendHex(hex1: string, hex2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hex1)
  const [r2, g2, b2] = hexToRgb(hex2)
  const w = Math.max(0, Math.min(1, weight))
  return `rgb(${Math.round(r1 * w + r2 * (1 - w))},${Math.round(g1 * w + g2 * (1 - w))},${Math.round(b1 * w + b2 * (1 - w))})`
}

// ---- Helpers ----

function lerp(current: number, target: number, speed: number): number {
  return current + (target - current) * speed
}

/** Ease-in-out: starts slow, speeds up, then slows down at the end. t in [0,1]. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
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

function LegendSwatch({ mainColor, label }: { mainColor: string; label: string }) {
  const surfaceColor = pick(COLORS.surfaceSoft)
  const surfaceSection = pick(COLORS.surfaceSection)
  const borderColor = blendHex(mainColor, surfaceSection, 0.45)
  const midColor = blendHex(mainColor, surfaceColor, 0.42)
  const edgeColor = blendHex(mainColor, surfaceColor, 0.55)
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className="shrink-0 rounded-full border-2"
        style={{
          width: 12,
          height: 12,
          background: `radial-gradient(circle at 35% 25%, ${surfaceColor} 0%, ${midColor} 40%, ${edgeColor} 100%)`,
          borderColor,
          boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.12)',
        }}
      />
      <span className="whitespace-nowrap">{label}</span>
    </div>
  )
}

function getBaseColor(node: VizNode): string {
  const score = node.polarity_score
  // Center-style: topic, viewpoint, controversy, agreement, position (including outer nodes of same type)
  if (node.entity_type === 'topic' || node.entity_type === 'viewpoint' || node.entity_type === 'controversy' || node.entity_type === 'agreement' || node.entity_type === 'position') {
    if (score != null && score > 0) return pick(COLORS.centerPositive)
    if (score != null && score < 0) return pick(COLORS.centerNegative)
    return pick(COLORS.centerNeutral)
  }
  // Claim/source nodes use accent-secondary
  if (score != null && score > 0) return pick(COLORS.claimPositive)
  if (score != null && score < 0) return pick(COLORS.claimNegative)
  return pick(COLORS.claimNeutral)
}

/** Returns gradient fill colors and border for the circle aesthetic (gradient + blended border) */
function getNodeStyle(node: VizNode): { mainColor: string; borderRgb: [number, number, number]; surfaceColor: string } {
  const mainColor = getBaseColor(node)
  const surfaceSoft = pick(COLORS.surfaceSoft)
  const surfaceSection = pick(COLORS.surfaceSection)
  const borderColor = blendHex(mainColor, surfaceSection, 0.45)
  const borderRgb = parseRgb(borderColor)
  return { mainColor, borderRgb, surfaceColor: surfaceSoft }
}

function parseRgb(rgbStr: string): [number, number, number] {
  const m = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  return [0, 0, 0]
}

function getEdgeColor(): string {
  return pick(COLORS.edge)
}

function getBgColor(): string {
  return pick(COLORS.background)
}

// ---- Per-node animated state (hover/drag visual effects) ----

type MorphPhase = 'idle' | 'drilling' | 'fadeIn'

interface AnimState {
  scale: number
  glowOpacity: number
  borderWidth: number
  borderAlpha: number
  brightness: number
  /** 1 = visible, 0 = invisible; used for morph fade-out and staggered fade-in */
  transitionOpacity: number
  /** During morph: overrides radius for smooth size transition. Undefined when not morphing. */
  morphRadius?: number
}

function defaultAnim(): AnimState {
  return { scale: 1, glowOpacity: 0, borderWidth: 2, borderAlpha: 1, brightness: 1, transitionOpacity: 1 }
}

/** Each drawn node tracks its own interaction state and animation */
interface DrawnNode {
  vizNode: VizNode
  id: string
  radius: number
  hovered: boolean
  dragging: boolean
  anim: AnimState
  /** Delay in ms before this node starts fading in (staggered fade-in) */
  fadeInDelayMs?: number
  /** Label to show next to the node (e.g. source name when outer nodes are sources) */
  label?: string
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

function createJitterForce(
  getNodes: () => SimNode[],
  getCenterId: () => string,
  config: JitterConfig,
  tickCountRef: React.MutableRefObject<number>
) {
  return function jitterForce() {
    tickCountRef.current++
    const freq = config.frequency || 1
    if (tickCountRef.current % freq !== 0) return
    const nodes = getNodes()
    const centerId = getCenterId()
    const typeScale = config.typeScale ?? {}
    for (const node of nodes) {
      const isCenter = node.id === centerId
      if (config.target === 'center' && !isCenter) continue
      if (config.target === 'outer' && isCenter) continue
      const scale = typeScale[node.drawnNode.vizNode.entity_type] ?? 1
      const s = config.strength * scale
      node.vx = (node.vx ?? 0) + (Math.random() - 0.5) * s
      node.vy = (node.vy ?? 0) + (Math.random() - 0.5) * s
    }
  }
}

export default function AtlasNodeTestCanvas({
  className,
  centerNode,
  outerNodes,
  hoveredOuterId = null,
  onHoveredOuterChange,
  onOuterNodeClick,
  onDrillPrepare,
  pendingZoomOut = false,
  onZoomOutComplete,
  scopeDepth = 1,
}: AtlasNodeTestCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)

  // Layout defaults (no user controls). Scale up when zoomed in (higher scopeDepth).
  const depthScale = 1 + (scopeDepth - 1) * 0.2
  const nodeRadius = Math.round(DEFAULT_NODE_RADIUS * depthScale)
  const claimRadius = nodeRadius
  const centerRadius = Math.round(nodeRadius * 1.5)
  const linkDistance = DEFAULT_LINK_DISTANCE
  const linkStrength = DEFAULT_LINK_STRENGTH
  const chargeStrength = DEFAULT_CHARGE_STRENGTH

  // Refs for hover sync (avoid stale closures in callbacks)
  const hoveredOuterIdRef = useRef<string | null>(hoveredOuterId)
  hoveredOuterIdRef.current = hoveredOuterId
  const onHoveredOuterChangeRef = useRef(onHoveredOuterChange)
  onHoveredOuterChangeRef.current = onHoveredOuterChange
  const onOuterNodeClickRef = useRef(onOuterNodeClick)
  onOuterNodeClickRef.current = onOuterNodeClick
  const onDrillPrepareRef = useRef(onDrillPrepare)
  onDrillPrepareRef.current = onDrillPrepare
  const onZoomOutCompleteRef = useRef(onZoomOutComplete)
  onZoomOutCompleteRef.current = onZoomOutComplete
  const pendingZoomOutRef = useRef(pendingZoomOut)
  pendingZoomOutRef.current = pendingZoomOut

  // Track click vs drag: left click = accordion, right click = drag
  const dragStartNodeRef = useRef<SimNode | null>(null)
  const dragButtonRef = useRef<number>(0)
  const hasMovedDuringDragRef = useRef(false)
  const dragOffsetXRef = useRef(0)
  const dragOffsetYRef = useRef(0)
  const preventContextMenuRef = useRef(false)

  // All drawn nodes (center + connected sources)
  const drawnNodes = useRef<DrawnNode[]>([])
  // The d3-force simulation nodes (these hold x/y positions that the sim updates)
  const simNodes = useRef<SimNode[]>([])
  const simLinks = useRef<SimLink[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulationRef = useRef<any>(null)

  // Hover animation loop (separate from simulation tick)
  const animFrameId = useRef<number>(0)
  const animRunning = useRef(false)

  // Jitter force tick counter (for frequency)
  const jitterTickCountRef = useRef(0)

  // Morph animation state (drill-down and zoom-out)
  const morphPhaseRef = useRef<MorphPhase>('idle')
  const morphDirectionRef = useRef<'drill' | 'zoomOut'>('drill')
  const morphClickedNodeIdRef = useRef<string | null>(null)
  const morphClickedEntityRef = useRef<{ entityType: string; entityId: string } | null>(null)
  const morphStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const morphFadeInStartTimeRef = useRef<number>(0)
  const drillJustCompletedRef = useRef(false)
  const morphStartTimeRef = useRef<number>(0)
  const morphFrameIdRef = useRef<number>(0)
  const zoomOutTargetPosRef = useRef<{ x: number; y: number } | null>(null)
  const zoomOutJustCompletedRef = useRef(false)
  const zoomOutReturnedNodeIdRef = useRef<string | null>(null)

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

    // Find center node by id (outer nodes can also be viewpoint type)
    const centerDrawn = centerNode
      ? all.find((dn) => dn.id === `${centerNode.entity_type}:${centerNode.entity_id}`)
      : all[0]
    const centerPos = centerDrawn ? posMap.get(centerDrawn.id) : null

    // Draw labels (behind nodes) - so nodes render on top when overlapping
    for (const dn of all) {
      if (!dn.label) continue
      const pos = posMap.get(dn.id)
      if (!pos) continue
      const a = dn.anim
      if (a.transitionOpacity < 0.01) continue
      ctx.save()
      ctx.globalAlpha = a.transitionOpacity
      const baseRadius = a.morphRadius ?? dn.radius
      const radius = baseRadius * a.scale
      const { x, y } = pos
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isDark ? '#9ca3af' : '#6b7280'
      const labelX = x + radius + 6
      const maxWidth = cw - labelX - 8
      let labelText = dn.label
      const metrics = ctx.measureText(labelText)
      if (metrics.width > maxWidth && maxWidth > 20) {
        while (labelText.length > 0 && ctx.measureText(labelText + '…').width > maxWidth) {
          labelText = labelText.slice(0, -1)
        }
        labelText = labelText + '…'
      }
      ctx.fillText(labelText, labelX, y)
      ctx.restore()
    }

    // Draw edges (behind nodes) - line grows from center toward outer node
    if (centerPos) {
      ctx.strokeStyle = getEdgeColor()
      ctx.lineWidth = 1.5
      for (const dn of all) {
        if (dn === centerDrawn) continue
        const pos = posMap.get(dn.id)
        if (!pos) continue
        const centerOpacity = centerDrawn?.anim.transitionOpacity ?? 1
        const outerOpacity = dn.anim.transitionOpacity
        const t = Math.min(centerOpacity, outerOpacity)
        if (t < 0.01) continue
        ctx.save()
        ctx.globalAlpha = t
        ctx.beginPath()
        ctx.moveTo(centerPos.x, centerPos.y)
        // Draw only to interpolated point so line appears to grow from center
        const endX = centerPos.x + (pos.x - centerPos.x) * t
        const endY = centerPos.y + (pos.y - centerPos.y) * t
        ctx.lineTo(endX, endY)
        ctx.stroke()
        ctx.restore()
      }
    }

    // Draw each node (circle aesthetic: gradient fill, blended border, subtle shadow)
    for (const dn of all) {
      const pos = posMap.get(dn.id)
      if (!pos) continue
      const a = dn.anim
      if (a.transitionOpacity < 0.01) continue
      ctx.save()
      ctx.globalAlpha = a.transitionOpacity
      const baseRadius = a.morphRadius ?? dn.radius
      const radius = baseRadius * a.scale
      const { mainColor, borderRgb, surfaceColor } = getNodeStyle(dn.vizNode)
      const baseRgb = hexToRgb(mainColor)
      const litRgb = brighten(baseRgb, a.brightness)
      const litHex = `#${litRgb[0].toString(16).padStart(2, '0')}${litRgb[1].toString(16).padStart(2, '0')}${litRgb[2].toString(16).padStart(2, '0')}`
      const { x, y } = pos

      // Glow ring (on hover)
      if (a.glowOpacity > 0.01) {
        ctx.beginPath()
        ctx.arc(x, y, radius + GLOW_SPREAD, 0, 2 * Math.PI)
        const glowAlpha = (isDark ? 0.45 : 0.35) * a.glowOpacity
        const glowRgb = brighten(baseRgb, 1.5)
        ctx.fillStyle = `rgba(${glowRgb[0]},${glowRgb[1]},${glowRgb[2]},${glowAlpha})`
        ctx.fill()
      }

      // Radial gradient fill (circle aesthetic: light center -> main color)
      const gradX0 = x - radius * 0.35
      const gradY0 = y - radius * 0.25
      const gradient = ctx.createRadialGradient(gradX0, gradY0, 0, x, y, radius)
      gradient.addColorStop(0, surfaceColor)
      gradient.addColorStop(0.4, blendHex(litHex, surfaceColor, 0.42))
      gradient.addColorStop(1, blendHex(litHex, surfaceColor, 0.55))

      // Shadow then fill (canvas shadow applies to next draw)
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 4
      ctx.shadowBlur = 18
      ctx.shadowColor = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.14)'
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      // Border (blended with fill; fades out on hover)
      const borderAlpha = a.borderAlpha
      ctx.strokeStyle = `rgba(${borderRgb[0]},${borderRgb[1]},${borderRgb[2]},${borderAlpha.toFixed(2)})`
      ctx.lineWidth = a.borderWidth
      if (a.borderWidth > 0.1) ctx.stroke()
      ctx.restore()
    }

    // Cursor
    const anyHovered = all.some((dn) => dn.hovered)
    const anyDragging = all.some((dn) => dn.dragging)
    canvas.style.cursor = anyDragging ? 'grabbing' : anyHovered ? 'grab' : 'default'
  }, [centerNode])

  // ---- Get animation targets for a node ----
  function getTargets(dn: DrawnNode): AnimState {
    const preserve = { transitionOpacity: dn.anim.transitionOpacity }
    if (dn.dragging) {
      return { scale: 0.94, glowOpacity: 0, borderWidth: 1.5, borderAlpha: 0.4, brightness: 0.95, ...preserve }
    }
    if (dn.hovered) {
      return { scale: HOVER_SCALE, glowOpacity: 1, borderWidth: 0, borderAlpha: 0, brightness: HOVER_BRIGHTNESS, ...preserve }
    }
    return { scale: 1, glowOpacity: 0, borderWidth: 2, borderAlpha: 1, brightness: 1, ...preserve }
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

  // ---- Morph loop (drill-down: outer drifts to center; zoom-out: center drifts to outer) ----
  const runMorphLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2
    const cy = CANVAS_HEIGHT / 2

    const elapsed = performance.now() - morphStartTimeRef.current
    const driftProgressRaw = Math.min(1, elapsed / MORPH_DRIFT_DURATION_MS)
    const driftProgress = easeInOutCubic(driftProgressRaw)
    const fadeProgress = Math.min(1, elapsed / MORPH_FADE_DURATION_MS)

    const direction = morphDirectionRef.current
    const sNodes = simNodes.current

    if (direction === 'drill') {
      const clickedId = morphClickedNodeIdRef.current
      const startPos = morphStartPosRef.current
      const centerRadius = sNodes[0]?.drawnNode.radius ?? DEFAULT_NODE_RADIUS * 1.5
      for (const sn of sNodes) {
        if (sn.id === clickedId && startPos) {
          sn.x = startPos.x + (cx - startPos.x) * driftProgress
          sn.y = startPos.y + (cy - startPos.y) * driftProgress
          sn.drawnNode.anim.transitionOpacity = 1
          const claimRadius = sn.drawnNode.radius
          sn.drawnNode.anim.morphRadius =
            claimRadius + (centerRadius - claimRadius) * driftProgress
        } else {
          sn.drawnNode.anim.transitionOpacity = 1 - fadeProgress
          delete sn.drawnNode.anim.morphRadius
        }
      }
    } else {
      const centerId = zoomOutReturnedNodeIdRef.current
      const targetPos = zoomOutTargetPosRef.current
      const claimRadius =
        sNodes.find((n) => n.id !== centerId)?.drawnNode.radius ?? DEFAULT_NODE_RADIUS
      for (const sn of sNodes) {
        if (sn.id === centerId && targetPos) {
          sn.x = cx + (targetPos.x - cx) * driftProgress
          sn.y = cy + (targetPos.y - cy) * driftProgress
          sn.drawnNode.anim.transitionOpacity = 1
          const centerRadius = sn.drawnNode.radius
          sn.drawnNode.anim.morphRadius =
            centerRadius + (claimRadius - centerRadius) * driftProgress
        } else {
          sn.drawnNode.anim.transitionOpacity = 1 - fadeProgress
          delete sn.drawnNode.anim.morphRadius
        }
      }
    }

    drawFrame()

    const driftDone = driftProgressRaw >= 1
    const fadeDone = fadeProgress >= 1

    if (driftDone && fadeDone) {
      morphPhaseRef.current = 'idle'
      if (direction === 'drill') {
        morphClickedNodeIdRef.current = null
        morphStartPosRef.current = null
        const entity = morphClickedEntityRef.current
        morphClickedEntityRef.current = null
        drillJustCompletedRef.current = true
        if (entity) {
          onOuterNodeClickRef.current?.(entity.entityType, entity.entityId)
        }
      } else {
        zoomOutJustCompletedRef.current = true
        zoomOutTargetPosRef.current = null
        onZoomOutCompleteRef.current?.()
      }
      morphFrameIdRef.current = 0
      return
    }

    morphFrameIdRef.current = requestAnimationFrame(runMorphLoop)
  }, [drawFrame])

  const startMorph = useCallback(
    (clickedNode: SimNode) => {
      if (simulationRef.current) {
        simulationRef.current.stop()
        simulationRef.current = null
      }
      morphDirectionRef.current = 'drill'
      morphPhaseRef.current = 'drilling'
      morphClickedNodeIdRef.current = clickedNode.id
      morphClickedEntityRef.current = {
        entityType: clickedNode.drawnNode.vizNode.entity_type,
        entityId: clickedNode.drawnNode.vizNode.entity_id,
      }
      morphStartPosRef.current = { x: clickedNode.x ?? 0, y: clickedNode.y ?? 0 }
      morphStartTimeRef.current = performance.now()
      for (const dn of drawnNodes.current) {
        dn.anim.transitionOpacity = 1
      }
      morphFrameIdRef.current = requestAnimationFrame(runMorphLoop)
    },
    [runMorphLoop]
  )

  const startZoomOutMorph = useCallback(() => {
    if (!centerNode || morphPhaseRef.current !== 'idle') return
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2
    const cy = CANVAS_HEIGHT / 2
    const centerId = `${centerNode.entity_type}:${centerNode.entity_id}`

    if (simulationRef.current) {
      simulationRef.current.stop()
      simulationRef.current = null
    }
    morphDirectionRef.current = 'zoomOut'
    morphPhaseRef.current = 'drilling'
    zoomOutReturnedNodeIdRef.current = centerId
    const angle = -Math.PI / 2
    zoomOutTargetPosRef.current = {
      x: cx + Math.cos(angle) * linkDistance,
      y: cy + Math.sin(angle) * linkDistance,
    }
    morphStartTimeRef.current = performance.now()
    for (const dn of drawnNodes.current) {
      dn.anim.transitionOpacity = 1
    }
    morphFrameIdRef.current = requestAnimationFrame(runMorphLoop)
  }, [centerNode, runMorphLoop])

  useEffect(() => {
    if (pendingZoomOut && centerNode) {
      startZoomOutMorph()
    }
  }, [pendingZoomOut, centerNode, startZoomOutMorph])

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

    // Build outer nodes from outerNodes
    const outer = outerNodes ?? []

    // Preserve existing positions from old sim nodes
    const oldPosMap = new Map<string, { x: number; y: number }>()
    for (const sn of simNodes.current) {
      oldPosMap.set(sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 })
    }

    // Build DrawnNodes
    const newDrawn: DrawnNode[] = []
    const oldDrawnMap = new Map<string, DrawnNode>()
    for (const dn of drawnNodes.current) oldDrawnMap.set(dn.id, dn)

    const doZoomOutFadeIn = zoomOutJustCompletedRef.current
    if (doZoomOutFadeIn) zoomOutJustCompletedRef.current = false
    const doDrillFadeIn = drillJustCompletedRef.current
    if (doDrillFadeIn) drillJustCompletedRef.current = false
    const doFadeIn = doDrillFadeIn || doZoomOutFadeIn
    const returnedNodeId = zoomOutReturnedNodeIdRef.current

    const oldCenter = oldDrawnMap.get(centerId)
    const centerAnim = oldCenter?.anim ?? defaultAnim()
    newDrawn.push({
      vizNode: center,
      id: centerId,
      radius: centerRadius,
      hovered: oldCenter?.hovered ?? false,
      dragging: oldCenter?.dragging ?? false,
      anim: doZoomOutFadeIn
        ? { ...centerAnim, transitionOpacity: 0 }
        : { ...centerAnim, transitionOpacity: 1 },
      fadeInDelayMs: doZoomOutFadeIn ? 0 : undefined,
    })

    const outerCount = outer.length
    let outerFadeIndex = 0
    // On zoom-out fade-in: slot 0 is reserved for the returned node (drifted from center).
    // Other outer nodes use slots 1, 2, 3, ... to avoid collision.
    let orbitSlotForNew = 0
    outer.forEach((item, i) => {
      const nodeId = `${item.entity_type}:${item.entity_id}`
      const syntheticNode: VizNode = {
        map_id: '',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        layer: 2,
        size: 1,
      }
      const old = oldDrawnMap.get(nodeId)
      const baseAnim = old?.anim ?? defaultAnim()
      const isReturnedNode = nodeId === returnedNodeId
      const anim: AnimState = doZoomOutFadeIn
        ? isReturnedNode
          ? { ...baseAnim, transitionOpacity: 1 }
          : { ...baseAnim, transitionOpacity: 0 }
        : doDrillFadeIn
          ? { ...baseAnim, transitionOpacity: 0 }
          : { ...baseAnim, transitionOpacity: baseAnim.transitionOpacity ?? 1 }
      // Zoom-out: returned node stays visible; center fades in first, then other outer nodes
      // stagger like drill-down: outer nodes start after FADE_IN_STAGGER_MS
      const fadeInDelayMs = doZoomOutFadeIn
        ? isReturnedNode
          ? undefined
          : FADE_IN_STAGGER_MS + outerFadeIndex++ * FADE_IN_STAGGER_MS
        : doDrillFadeIn
          ? i * FADE_IN_STAGGER_MS
          : undefined
      newDrawn.push({
        vizNode: syntheticNode,
        id: nodeId,
        radius: claimRadius,
        hovered: old?.hovered ?? false,
        dragging: old?.dragging ?? false,
        anim,
        fadeInDelayMs,
        label:
          item.entity_type === 'source' ||
          item.entity_type === 'viewpoint' ||
          item.entity_type === 'controversy' ||
          item.entity_type === 'position' ||
          item.entity_type === 'claim'
            ? item.label
            : undefined,
      })
      if (!oldPosMap.has(nodeId)) {
        const slotIndex =
          doZoomOutFadeIn && returnedNodeId
            ? orbitSlotForNew++ + 1
            : i
        const angle = (2 * Math.PI * slotIndex) / outerCount - Math.PI / 2
        // On zoom-out fade-in, use linkDistance (same as drift target) so all outer
        // nodes start at the same radius; avoids the returned node snapping when sim runs.
        const orbitRadius =
          doZoomOutFadeIn && returnedNodeId ? linkDistance : ORBIT_DISTANCE
        oldPosMap.set(nodeId, {
          x: cx + Math.cos(angle) * orbitRadius,
          y: cy + Math.sin(angle) * orbitRadius,
        })
      }
    })

    drawnNodes.current = newDrawn

    if (doFadeIn) {
      morphPhaseRef.current = 'fadeIn'
      morphFadeInStartTimeRef.current = performance.now()
    }

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

    // Build SimLinks (center <-> each outer node)
    const newSimLinks: SimLink[] = newDrawn
      .filter((dn) => dn.id !== centerId)
      .map((dn) => ({
        source: centerId,
        target: dn.id,
      }))
    simLinks.current = newSimLinks

    // Create the d3-force simulation
    jitterTickCountRef.current = 0
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

    if (JITTER_CONFIG) {
      sim.force(
        'jitter',
        createJitterForce(
          () => simNodes.current,
          () => centerId,
          JITTER_CONFIG,
          jitterTickCountRef
        )
      )
    }

    sim.on('tick', () => {
        if (JITTER_CONFIG && sim.alpha() <= JITTER_ALPHA_THRESHOLD) {
          sim.alpha(JITTER_ALPHA_LOW).alphaDecay(0)
        }
        if (morphPhaseRef.current === 'fadeIn') {
          const elapsed = performance.now() - morphFadeInStartTimeRef.current
          let allDone = true
          for (const dn of drawnNodes.current) {
            const delay = dn.fadeInDelayMs ?? -1
            if (delay < 0) continue
            if (elapsed >= delay) {
              const fadeProgress = Math.min(1, (elapsed - delay) / FADE_IN_DURATION_MS)
              dn.anim.transitionOpacity = fadeProgress
              if (fadeProgress < 1) allDone = false
            } else {
              allDone = false
            }
          }
          if (allDone) {
            morphPhaseRef.current = 'idle'
            zoomOutReturnedNodeIdRef.current = null
            if (pendingZoomOutRef.current) {
              startZoomOutMorph()
            }
          }
        }
        lerpAnimations()
        drawFrame()
      })

    simulationRef.current = sim

    return () => {
      sim.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerNode, outerNodes, canvasWidth, nodeRadius])

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
    sim.alpha(0.3).alphaDecay(0.02).restart()
  }, [linkDistance, linkStrength, chargeStrength])

  // Sync hoveredOuterId from content panel into node hover states
  const centerIdForHover = centerNode ? `${centerNode.entity_type}:${centerNode.entity_id}` : ''
  useEffect(() => {
    const sNodes = simNodes.current
    const id = hoveredOuterId
    let changed = false
    for (const sn of sNodes) {
      const isOuterNode = sn.id !== centerIdForHover
      const shouldHover = isOuterNode && sn.drawnNode.vizNode.entity_id === id
      if (sn.drawnNode.hovered !== shouldHover) {
        sn.drawnNode.hovered = shouldHover
        changed = true
      }
    }
    if (changed) startAnim()
  }, [hoveredOuterId, startAnim, centerIdForHover])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameId.current)
      cancelAnimationFrame(morphFrameIdRef.current)
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
          simulationRef.current.alpha(0.3).alphaDecay(0.02).restart()
        }
        return
      }

      // Update hover states (merge canvas hit + hoveredOuterId from content panel)
      const hit = findNodeAt(mx, my)
      const extId = hoveredOuterIdRef.current
      const centerId = centerNode ? `${centerNode.entity_type}:${centerNode.entity_id}` : ''
      let changed = false
      for (const sn of sNodes) {
        const isOuterNode = sn.id !== centerId
        const shouldHover =
          sn === hit || (isOuterNode && sn.drawnNode.vizNode.entity_id === extId)
        if (sn.drawnNode.hovered !== shouldHover) {
          sn.drawnNode.hovered = shouldHover
          changed = true
        }
      }
      const hoveredEntityId =
        hit && hit.id !== centerId ? hit.drawnNode.vizNode.entity_id : null
      onHoveredOuterChangeRef.current?.(hoveredEntityId)
      if (changed) startAnim()
    },
    [findNodeAt, startAnim, centerNode]
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
            simulationRef.current.alpha(0.3).alphaDecay(0.02).restart()
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

    // Left click (no drag) on an outer node: notify parent (drill or expand)
    if (
      startNode &&
      !didDrag &&
      dragButtonRef.current === 0
    ) {
      const centerId = centerNode ? `${centerNode.entity_type}:${centerNode.entity_id}` : ''
      if (startNode.id !== centerId) {
        const isDrill =
          (centerNode?.entity_type === 'agreement' &&
            startNode.drawnNode.vizNode.entity_type === 'position') ||
          (centerNode?.entity_type === 'controversy' &&
            startNode.drawnNode.vizNode.entity_type === 'viewpoint') ||
          (centerNode?.entity_type === 'topic' &&
            startNode.drawnNode.vizNode.entity_type === 'controversy')
        if (isDrill && morphPhaseRef.current === 'idle') {
          onDrillPrepareRef.current?.(
            startNode.drawnNode.vizNode.entity_type,
            startNode.drawnNode.vizNode.entity_id
          )
          startMorph(startNode)
        } else {
          onOuterNodeClickRef.current?.(
            startNode.drawnNode.vizNode.entity_type,
            startNode.drawnNode.vizNode.entity_id
          )
        }
      }
    }

    if (changed) {
      // Give a small reheat so nodes settle naturally
      if (simulationRef.current) {
        simulationRef.current.alpha(0.1).alphaDecay(0.02).restart()
      }
      startAnim()
    }
  }, [startAnim, centerNode, startMorph])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (preventContextMenuRef.current) {
      preventContextMenuRef.current = false
      e.preventDefault()
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    onHoveredOuterChangeRef.current?.(null)
    dragStartNodeRef.current = null
    hasMovedDuringDragRef.current = false
    preventContextMenuRef.current = false
    let changed = false
    for (const sn of simNodes.current) {
      const shouldHover = false // clear all hover on leave
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
        simulationRef.current.alpha(0.1).alphaDecay(0.02).restart()
      }
      startAnim()
    }
  }, [startAnim])

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
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
      <div
        className="absolute inset-x-0 top-3 z-10 flex flex-row flex-wrap justify-center items-center gap-x-4 gap-y-2 px-3 py-2"
        aria-label="Graph legend"
      >
        <span className="text-xs font-medium text-foreground shrink-0">Legend</span>
        <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="shrink-0 whitespace-nowrap">Center / Viewpoints:</span>
          <LegendSwatch mainColor={pick(COLORS.centerPositive)} label="Positive" />
          <LegendSwatch mainColor={pick(COLORS.centerNegative)} label="Negative" />
          <LegendSwatch mainColor={pick(COLORS.centerNeutral)} label="Neutral" />
          <LegendSwatch mainColor={pick(COLORS.claimNeutral)} label="Sources" />
        </div>
      </div>
    </div>
  )
}
