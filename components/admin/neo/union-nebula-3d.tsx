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
  type Union3DNode,
} from '@/lib/admin/neo-graph/union-3d'
import {
  capDevicePixelRatio,
  createBatchedNebulaScene,
  type BatchedNebulaScene,
} from '@/lib/admin/neo-graph/union-3d-scene'
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

type GraphApi = ForceGraph3DInstance & {
  scene?: () => { add: (obj: unknown) => void }
  camera?: () => THREE.Camera
  renderer?: () => THREE.WebGLRenderer
  nodeVisibility?: (v: boolean | ((n: unknown) => boolean)) => ForceGraph3DInstance
  linkVisibility?: (v: boolean | ((l: unknown) => boolean)) => ForceGraph3DInstance
  onEngineTick?: (fn: () => void) => ForceGraph3DInstance
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

function emptyObject3D() {
  const o = new THREE.Object3D()
  o.visible = false
  return o
}

function selectNode(
  n: Union3DNode,
  onSelectionChange: (selection: NeoSelection) => void
) {
  onSelectionChange({
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
  const graphRef = useRef<GraphApi | null>(null)
  const sceneRef = useRef<BatchedNebulaScene | null>(null)
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
    sceneRef.current?.setIdleOpacity(linkOpacity)
  }, [linkOpacity])

  useEffect(() => {
    setClusterCount(data.communities.length)
    setNodeCount(data.nodes.length)
    setEdgeCount(data.links.length)
  }, [data])

  const pulseRafRef = useRef<number | null>(null)

  useEffect(() => {
    selectedIdRef.current = selection.nodeId
    if (!selection.nodeId) setHoverLabel(null)
    sceneRef.current?.setSelection(selection.nodeId)

    if (pulseRafRef.current != null) {
      cancelAnimationFrame(pulseRafRef.current)
      pulseRafRef.current = null
    }
    if (!selection.nodeId) return

    const tick = (now: number) => {
      if (!selectedIdRef.current) {
        pulseRafRef.current = null
        return
      }
      sceneRef.current?.tickPulse(now)
      pulseRafRef.current = requestAnimationFrame(tick)
    }
    pulseRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (pulseRafRef.current != null) {
        cancelAnimationFrame(pulseRafRef.current)
        pulseRafRef.current = null
      }
    }
  }, [selection.nodeId])

  const clearResumeTimer = () => {
    if (resumeSpinTimer.current) {
      window.clearTimeout(resumeSpinTimer.current)
      resumeSpinTimer.current = null
    }
  }

  const enableSpin = (fg: GraphApi) => {
    if (document.hidden) return
    const controls = fg.controls() as OrbitControlsLike | null
    if (controls) controls.autoRotate = true
  }

  const pauseSpin = (fg: GraphApi) => {
    const controls = fg.controls() as OrbitControlsLike | null
    if (controls) controls.autoRotate = false
    clearResumeTimer()
    resumeSpinTimer.current = window.setTimeout(() => {
      if (graphRef.current === fg && !selectedIdRef.current) enableSpin(fg)
    }, 1400)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    engineReadyRef.current = false
    const coarse =
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches
    const dpr = capDevicePixelRatio()

    const batched = createBatchedNebulaScene()
    sceneRef.current = batched
    batched.setIdleOpacity(linkOpacityRef.current)
    batched.setPixelRatio(dpr)
    batched.setViewportHeight(el.clientHeight || 600)

    const fg = new ForceGraph3D(el, { controlType: 'orbit' }) as GraphApi
    fg.backgroundColor('#050508')
      .showNavInfo(false)
      .enableNodeDrag(false)
      .nodeLabel(() => '')
      .nodeThreeObject(() => emptyObject3D())
      .nodeThreeObjectExtend(false)
      // Seed lobes already place the cloud; a short polish is enough.
      .cooldownTicks(coarse ? 12 : 25)
      .warmupTicks(coarse ? 4 : 8)
      .d3AlphaDecay(0.05)
      .d3VelocityDecay(0.4)
      .onEngineStop(() => {
        if (cancelled) return
        const live = fg.graphData()
        batched.syncPositions(live.nodes as Array<{ id?: string; x?: number; y?: number; z?: number }>)
        setLayoutBusy(false)
        enableSpin(fg)
      })

    fg.nodeVisibility?.(() => false)
    fg.linkVisibility?.(() => false)
    fg.onEngineTick?.(() => {
      const live = fg.graphData()
      batched.syncPositions(
        live.nodes as Array<{ id?: string; x?: number; y?: number; z?: number }>
      )
    })

    const renderer = fg.renderer?.()
    if (renderer) {
      renderer.setPixelRatio(dpr)
    }
    const threeScene = fg.scene?.()
    if (threeScene) batched.attach(threeScene as Parameters<BatchedNebulaScene['attach']>[0])

    graphRef.current = fg
    setLayoutBusy(true)

    const controls = fg.controls() as OrbitControlsLike | null
    let onControlStart: (() => void) | undefined
    if (controls) {
      controls.enableDamping = true
      controls.autoRotateSpeed = 1.15
      onControlStart = () => pauseSpin(fg)
      controls.addEventListener?.('start', onControlStart)
    }

    const canvas = renderer?.domElement ?? el.querySelector('canvas')
    let downX = 0
    let downY = 0
    const onPointerDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const onPointerMove = (ev: PointerEvent) => {
      const camera = fg.camera?.()
      const host = canvas
      if (!camera || !host) return
      const hit = batched.pick(camera, host, ev.clientX, ev.clientY)
      setHoverLabel(hit?.name ?? null)
      el.style.cursor = hit ? 'pointer' : 'grab'
      if (hit) pauseSpin(fg)
    }
    const onPointerUp = (ev: PointerEvent) => {
      if (cancelled) return
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 5) return
      const camera = fg.camera?.()
      const host = canvas
      if (!camera || !host) return
      const hit = batched.pick(camera, host, ev.clientX, ev.clientY)
      pauseSpin(fg)
      if (!hit?.id) {
        selectedIdRef.current = null
        setHoverLabel(null)
        onSelectionChangeRef.current(EMPTY_SELECTION)
        return
      }
      const n = dataRef.current.nodes.find((x) => x.id === hit.id) ?? hit
      if (selectedIdRef.current === n.id) {
        selectedIdRef.current = null
        setHoverLabel(null)
        onSelectionChangeRef.current(EMPTY_SELECTION)
        return
      }
      selectedIdRef.current = n.id
      setHoverLabel(n.name)
      selectNode(n, onSelectionChangeRef.current)
    }
    canvas?.addEventListener('pointerdown', onPointerDown)
    canvas?.addEventListener('pointermove', onPointerMove)
    canvas?.addEventListener('pointerup', onPointerUp)

    const onResize = () => {
      if (cancelled || !containerRef.current) return
      fg.width(containerRef.current.clientWidth)
      fg.height(containerRef.current.clientHeight)
      batched.setViewportHeight(containerRef.current.clientHeight)
      renderer?.setPixelRatio(capDevicePixelRatio())
      batched.setPixelRatio(capDevicePixelRatio())
    }
    onResize()
    const ro = new ResizeObserver(onResize)
    ro.observe(el)

    const onVisibility = () => {
      if (document.hidden) {
        const c = fg.controls() as OrbitControlsLike | null
        if (c) c.autoRotate = false
        return
      }
      if (!selectedIdRef.current) enableSpin(fg)
    }
    document.addEventListener('visibilitychange', onVisibility)

    const boot = window.setTimeout(() => {
      if (cancelled) return
      const snapshot = dataRef.current
      batched.setGraph(snapshot.nodes, snapshot.links)
      fg.graphData({
        nodes: snapshot.nodes.map((n) => ({ ...n })),
        links: snapshot.links.map((l) => ({ ...l })),
      })
      const liveScene = fg.scene?.()
      if (liveScene) batched.attach(liveScene as Parameters<BatchedNebulaScene['attach']>[0])
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
      document.removeEventListener('visibilitychange', onVisibility)
      canvas?.removeEventListener('pointerdown', onPointerDown)
      canvas?.removeEventListener('pointermove', onPointerMove)
      canvas?.removeEventListener('pointerup', onPointerUp)
      if (onControlStart) {
        ;(fg.controls() as OrbitControlsLike | null)?.removeEventListener?.(
          'start',
          onControlStart
        )
      }
      batched.dispose()
      sceneRef.current = null
      try {
        fg._destructor()
      } catch {
        /* already torn down */
      }
      graphRef.current = null
      el.replaceChildren()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fg = graphRef.current
    const batched = sceneRef.current
    if (!fg || !batched || !engineReadyRef.current) return
    setLayoutBusy(true)
    pauseSpin(fg)
    try {
      batched.setGraph(data.nodes, data.links)
      batched.setIdleOpacity(linkOpacityRef.current)
      batched.setSelection(selectedIdRef.current)
      fg.graphData({
        nodes: data.nodes.map((n) => ({ ...n })),
        links: data.links.map((l) => ({ ...l })),
      })
      const liveScene = fg.scene?.()
      if (liveScene) batched.attach(liveScene as Parameters<BatchedNebulaScene['attach']>[0])
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
