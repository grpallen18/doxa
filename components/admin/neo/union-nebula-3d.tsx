'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D, {
  type ForceGraph3DInstance,
} from '3d-force-graph'
import * as THREE from 'three'
import {
  EMPTY_SELECTION,
  type NeoSelection,
} from '@/lib/admin/neo-graph/neo-selection'
import {
  buildUnion3DGraphData,
  nebulaIdleAlpha3d,
  type Union3DLink,
  type Union3DNode,
} from '@/lib/admin/neo-graph/union-3d'
import type { DoxaGraphProjection } from '@/lib/admin/neo-graph/types'
import {
  NEBULA_BLEND_DEFAULT,
  NEBULA_RESOLUTION_DEFAULT,
} from '@/lib/admin/neo-graph/louvain-nebula'
import { NEBULA_HEAT_DEFAULT } from '@/lib/admin/neo-graph/appearance'

type OrbitControlsLike = {
  autoRotate?: boolean
  autoRotateSpeed?: number
  enableDamping?: boolean
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

type ForceWithStrength = {
  strength?: (s: number) => unknown
  distance?: (d: number) => unknown
}

type Props = {
  projection: DoxaGraphProjection
  heat?: number
  resolution?: number
  blend?: number
  layoutEpoch?: number
  initialFocusNodeId?: string | null
  selection: NeoSelection
  onSelectionChange: (selection: NeoSelection) => void
  className?: string
}

function tuneForces(fg: ForceGraph3DInstance) {
  try {
    // Pack into one brain: weak repulsion, short stiff links, strong center.
    const charge = fg.d3Force('charge') as ForceWithStrength | null
    charge?.strength?.(-2.2)
    const link = fg.d3Force('link') as ForceWithStrength | null
    link?.distance?.(3.5)
    link?.strength?.(0.55)
    const center = fg.d3Force('center') as ForceWithStrength | null
    center?.strength?.(1.35)
  } catch {
    /* force graph still initializing */
  }
}

/** Soft radial glow — shared by all star sprites (white, tinted via material.color). */
let sharedGlowTexture: THREE.CanvasTexture | null = null
let sharedGlowTextureRev = -1

/** Bump to force ForceGraph remount after node-style edits (HMR-safe). */
const NODE_STYLE_REV = 10

function getGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture && sharedGlowTextureRev === NODE_STYLE_REV) {
    return sharedGlowTexture
  }
  sharedGlowTextureRev = NODE_STYLE_REV
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    sharedGlowTexture = new THREE.CanvasTexture(canvas)
    return sharedGlowTexture
  }
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  )
  // Midpoint between washed-out core and dull falloff.
  g.addColorStop(0, 'rgba(255,255,255,0.88)')
  g.addColorStop(0.15, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.38, 'rgba(255,255,255,0.24)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.07)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedGlowTexture = new THREE.CanvasTexture(canvas)
  sharedGlowTexture.needsUpdate = true
  return sharedGlowTexture
}

/** Soft additive sprite — halfway between washed and dull. */
function createStarNode(node: Union3DNode): THREE.Object3D {
  const heat = Math.max(0, Math.min(1, node.heat ?? 0))
  const degree = Math.max(0, node.degree ?? 0)
  const group = new THREE.Group()

  const glowMat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color: new THREE.Color(node.color || '#a8a29e'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.48 + heat * 0.14,
  })
  const glow = new THREE.Sprite(glowMat)
  const scale =
    2.1 +
    (node.val || 1) * 0.8 +
    Math.pow(heat, 1.45) * 20 +
    Math.sqrt(degree) * 1.05
  glow.scale.set(scale, scale, 1)
  glow.raycast = () => {}

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(1.35 + Math.min(2.5, heat * 2), 8, 8),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  )
  hit.name = 'pick'

  group.add(glow)
  group.add(hit)
  return group
}

/**
 * Bind edge look once at mount. Do not rebind on selection — that destroys
 * materials/particles and freezes hover. Heat opacity is applied live in
 * linkPositionUpdate via getIdleOpacity().
 */
function bindEdgeAccessors(
  fg: ForceGraph3DInstance,
  opts: { getIdleOpacity: () => number }
) {
  const { getIdleOpacity } = opts

  fg.linkDirectionalParticles(0)
  fg.linkThreeObject((raw) => {
    const link = raw as Union3DLink
    const c0 = new THREE.Color(link.sourceColor || '#a8a29e')
    const c1 = new THREE.Color(link.targetColor || '#a8a29e')
    const colors = new Float32Array([
      c0.r,
      c0.g,
      c0.b,
      c1.r,
      c1.g,
      c1.b,
    ])
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3)
    )
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: getIdleOpacity(),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return new THREE.Line(geometry, material)
  })
  fg.linkPositionUpdate((obj, coords) => {
    const start = coords?.start
    const end = coords?.end
    if (
      !start ||
      !end ||
      !Number.isFinite(start.x) ||
      !Number.isFinite(start.y) ||
      !Number.isFinite(start.z) ||
      !Number.isFinite(end.x) ||
      !Number.isFinite(end.y) ||
      !Number.isFinite(end.z)
    ) {
      return true
    }
    const line = obj as THREE.Line
    const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute
    pos.setXYZ(0, start.x, start.y, start.z)
    pos.setXYZ(1, end.x, end.y, end.z)
    pos.needsUpdate = true
    const mat = line.material as THREE.LineBasicMaterial
    if (mat) mat.opacity = getIdleOpacity()
    return true
  })
}


export function UnionNebula3D({
  projection,
  heat = NEBULA_HEAT_DEFAULT,
  resolution = NEBULA_RESOLUTION_DEFAULT,
  blend = NEBULA_BLEND_DEFAULT,
  layoutEpoch = 0,
  initialFocusNodeId = null,
  selection,
  onSelectionChange,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraph3DInstance | null>(null)
  const engineReadyRef = useRef(false)
  const resumeSpinTimer = useRef<number | null>(null)
  const frameTimer = useRef<number | null>(null)
  const selectedIdRef = useRef<string | null>(selection.nodeId)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange
  selectedIdRef.current = selection.nodeId

  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [clusterCount, setClusterCount] = useState(0)
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [layoutBusy, setLayoutBusy] = useState(true)

  const data = useMemo(
    () =>
      buildUnion3DGraphData(projection, {
        resolutionDial: resolution,
        blend,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, resolution, blend, layoutEpoch]
  )
  const dataRef = useRef(data)
  dataRef.current = data

  const linkOpacity = useMemo(
    () => nebulaIdleAlpha3d(heat, data.links.length),
    [heat, data.links.length]
  )
  const linkOpacityRef = useRef(linkOpacity)
  linkOpacityRef.current = linkOpacity

  useEffect(() => {
    setClusterCount(data.communities.length)
    setNodeCount(data.nodes.length)
    setEdgeCount(data.links.length)
  }, [data])

  useEffect(() => {
    selectedIdRef.current = selection.nodeId
    // Clear sticky hover chrome when selection changes / drawer closes.
    if (!selection.nodeId) setHoverLabel(null)
  }, [selection.nodeId])

  const clearResumeTimer = () => {
    if (resumeSpinTimer.current) {
      window.clearTimeout(resumeSpinTimer.current)
      resumeSpinTimer.current = null
    }
  }

  const enableSpin = (fg: ForceGraph3DInstance) => {
    const controls = fg.controls() as OrbitControlsLike | null
    if (controls) controls.autoRotate = true
  }

  const pauseSpin = (fg: ForceGraph3DInstance) => {
    const controls = fg.controls() as OrbitControlsLike | null
    if (controls) controls.autoRotate = false
    clearResumeTimer()
    resumeSpinTimer.current = window.setTimeout(() => {
      if (graphRef.current === fg) enableSpin(fg)
    }, 4000)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    engineReadyRef.current = false

    const fg = new ForceGraph3D(el, { controlType: 'orbit' })
      .backgroundColor('#050508')
      .showNavInfo(false)
      .enableNodeDrag(false)
      .nodeLabel((n) => (n as Union3DNode).name || '')
      .nodeThreeObject((n) => createStarNode(n as Union3DNode))
      .nodeThreeObjectExtend(false)
      .cooldownTicks(160)
      .warmupTicks(50)
      .d3AlphaDecay(0.028)
      .d3VelocityDecay(0.4)
      .onNodeHover((node) => {
        if (cancelled) return
        const n = node as Union3DNode | null
        setHoverLabel(n?.name ?? null)
        el.style.cursor = n ? 'pointer' : 'grab'
        if (n) pauseSpin(fg)
      })
      .onNodeClick((node) => {
        if (cancelled) return
        const raw = node as Union3DNode | null
        if (!raw?.id) {
          selectedIdRef.current = null
          setHoverLabel(null)
          onSelectionChangeRef.current(EMPTY_SELECTION)
          return
        }
        const n =
          dataRef.current.nodes.find((x) => x.id === raw.id) ?? raw
        pauseSpin(fg)
        selectedIdRef.current = n.id
        setHoverLabel(n.name)
        onSelectionChangeRef.current({
          ...EMPTY_SELECTION,
          nodeId: n.id,
          kind: n.kind,
          label: n.name,
          charStart: n.charStart,
          charEnd: n.charEnd,
          properties: {
            ...(n.properties ?? {}),
            louvainId: n.louvainId,
            degree: n.degree,
            communityId: n.communityId,
            communityLabel: n.communityLabel,
          },
        })
      })
      .onBackgroundClick(() => {
        if (cancelled) return
        selectedIdRef.current = null
        setHoverLabel(null)
        onSelectionChangeRef.current(EMPTY_SELECTION)
      })
      .onEngineStop(() => {
        if (cancelled) return
        setLayoutBusy(false)
        enableSpin(fg)
      })

    bindEdgeAccessors(fg, {
      getIdleOpacity: () => linkOpacityRef.current,
    })

    graphRef.current = fg
    setLayoutBusy(true)

    const controls = fg.controls() as OrbitControlsLike | null
    let onControlStart: (() => void) | undefined
    if (controls) {
      controls.enableDamping = true
      controls.autoRotateSpeed = 0.55
      onControlStart = () => pauseSpin(fg)
      controls.addEventListener?.('start', onControlStart)
    }

    const onResize = () => {
      if (cancelled || !containerRef.current) return
      fg.width(containerRef.current.clientWidth)
      fg.height(containerRef.current.clientHeight)
    }
    onResize()
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    const boot = window.setTimeout(() => {
      if (cancelled) return
      const snapshot = dataRef.current
      fg.graphData({
        nodes: snapshot.nodes.map((n) => ({ ...n })),
        links: snapshot.links.map((l) => ({ ...l })),
      })
      tuneForces(fg)
      engineReadyRef.current = true
      frameTimer.current = window.setTimeout(() => {
        if (cancelled) return
        try {
          fg.zoomToFit(800, 60)
        } catch {
          /* ignore */
        }
      }, 1100)
    }, 0)

    return () => {
      cancelled = true
      engineReadyRef.current = false
      window.clearTimeout(boot)
      if (frameTimer.current) window.clearTimeout(frameTimer.current)
      ro.disconnect()
      clearResumeTimer()
      if (onControlStart) {
        ;(fg.controls() as OrbitControlsLike | null)?.removeEventListener?.(
          'start',
          onControlStart
        )
      }
      try {
        fg._destructor()
      } catch {
        /* already torn down */
      }
      graphRef.current = null
      el.replaceChildren()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [NODE_STYLE_REV])

  // Structural rebuild (depth / resolution / blend)
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || !engineReadyRef.current) return
    setLayoutBusy(true)
    pauseSpin(fg)
    try {
      fg.graphData({
        nodes: data.nodes.map((n) => ({ ...n })),
        links: data.links.map((l) => ({ ...l })),
      })
      tuneForces(fg)
    } catch {
      /* engine mid-teardown */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || !engineReadyRef.current || !initialFocusNodeId) return
    const node = data.nodes.find((n) => n.id === initialFocusNodeId)
    if (!node) return
    const dist = 220
    try {
      fg.cameraPosition(
        { x: node.x + dist, y: node.y + dist * 0.35, z: node.z + dist },
        { x: node.x, y: node.y, z: node.z },
        1200
      )
    } catch {
      /* ignore */
    }
  }, [initialFocusNodeId, data])

  return (
    <div className={`relative min-h-0 flex-1 bg-[#050508] ${className ?? ''}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-sm text-[11px] text-zinc-500">
        {nodeCount.toLocaleString()} nodes · {edgeCount.toLocaleString()} edges
        {clusterCount ? ` · ${clusterCount} clusters` : ''}
        {layoutBusy ? ' · arranging…' : ' · drag to orbit'}
      </div>
      {hoverLabel ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-xs truncate rounded-md border border-white/10 bg-black/70 px-2 py-1 text-xs text-zinc-200">
          {hoverLabel}
        </div>
      ) : null}
    </div>
  )
}
