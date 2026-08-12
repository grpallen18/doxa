import {
  nebulaHeat,
  NEBULA_HEAT_MIN,
  NEBULA_HEAT_MAX,
} from '@/lib/admin/neo-graph/appearance'
import { buildGraphologyFromProjection } from '@/lib/admin/neo-graph/graphology-adapter'
import { NEBULA_SEED_SCALE } from '@/lib/admin/neo-graph/island-layout'
import { hashSeed } from '@/lib/admin/neo-graph/layout-pipeline'
import {
  applyLouvainNebula,
  blendToLobeRingFrac,
  NEBULA_BLEND_DEFAULT,
  NEBULA_RESOLUTION_DEFAULT,
} from '@/lib/admin/neo-graph/louvain-nebula'
import type {
  DoxaGraphProjection,
  NeoGraphCommunity,
  NeoGraphFilters,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import { DEFAULT_UNION_V2_FILTERS } from '@/lib/admin/neo-graph/types'

/** Tighter than 2D — 3D charge otherwise explodes the sphere. */
const LOBE_JITTER_FRAC = 0.38

export type Union3DNode = {
  id: string
  name: string
  color: string
  val: number
  kind: NeoNodeKind
  louvainId: string
  degree: number
  /** 0..1 from degree — drives emissive glow. */
  heat: number
  communityId?: string
  communityLabel?: string
  charStart?: number
  charEnd?: number
  properties?: Record<string, unknown>
  x: number
  y: number
  z: number
}

export type Union3DLink = {
  source: string
  target: string
  /** Louvain paint at source end (for source→target edge gradients). */
  sourceColor: string
  /** Louvain paint at target end. */
  targetColor: string
}

export type Union3DGraphData = {
  nodes: Union3DNode[]
  links: Union3DLink[]
  communities: NeoGraphCommunity[]
}

function louvainOfAttr(raw: unknown): string {
  if (typeof raw === 'string' && raw) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return `louvain:${raw}`
  return 'louvain:none'
}

/** Evenly distribute k points on a sphere (Fibonacci). */
function spherePoint(
  i: number,
  k: number,
  radius: number
): { x: number; y: number; z: number } {
  if (k <= 1) return { x: 0, y: 0, z: 0 }
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - (i / (k - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = golden * i
  return {
    x: Math.cos(theta) * r * radius,
    y: y * radius,
    z: Math.sin(theta) * r * radius,
  }
}

function jitter3(
  id: string,
  scale: number
): { x: number; y: number; z: number } {
  const sx = hashSeed(`${id}:lobe3`)
  const sy = hashSeed(`${id}:lobe3:y`)
  const sz = hashSeed(`${id}:lobe3:z`)
  return {
    x: ((sx % 1000) / 1000 - 0.5) * scale,
    y: ((sy % 1000) / 1000 - 0.5) * scale,
    z: ((sz % 1000) / 1000 - 0.5) * scale,
  }
}

/**
 * 3D edge tissue — heat maps almost linearly so the dial is obvious in WebGL.
 * Mild √edges dampening keeps huge graphs from going solid white.
 */
export function nebulaIdleAlpha3d(heat: number, edgeCount: number): number {
  const k = Math.max(NEBULA_HEAT_MIN, Math.min(NEBULA_HEAT_MAX, heat))
  const n = Math.max(1, edgeCount)
  const t = (k - NEBULA_HEAT_MIN) / (NEBULA_HEAT_MAX - NEBULA_HEAT_MIN)
  // Soft damp only on very dense graphs; keep heat 1 readable.
  const damp = Math.min(1.1, 120 / Math.sqrt(n))
  return Math.min(0.82, Math.max(0.045, (0.05 + t * 0.72) * Math.max(0.55, damp)))
}

/**
 * Build 3D force-graph data: Louvain paint + overlapping spherical lobes.
 */
export function buildUnion3DGraphData(
  projection: DoxaGraphProjection,
  options?: {
    filters?: NeoGraphFilters
    resolutionDial?: number
    blend?: number
  }
): Union3DGraphData {
  const filters = options?.filters ?? DEFAULT_UNION_V2_FILTERS
  const resolutionDial = options?.resolutionDial ?? NEBULA_RESOLUTION_DEFAULT
  const blend = options?.blend ?? NEBULA_BLEND_DEFAULT

  const { graph } = buildGraphologyFromProjection(projection, filters, {
    colorMode: 'community',
    sizeMode: 'compact',
    seedMode: 'none',
  })

  const { communities } = applyLouvainNebula(graph, { resolutionDial })

  const counts = new Map<string, number>()
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const lid = louvainOfAttr(attrs.louvainId)
    counts.set(lid, (counts.get(lid) ?? 0) + 1)
  })
  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )
  const k = ranked.length
  const ring = NEBULA_SEED_SCALE * blendToLobeRingFrac(blend)
  const jitterScale = NEBULA_SEED_SCALE * LOBE_JITTER_FRAC
  const centers = new Map<string, { x: number; y: number; z: number }>()
  for (let i = 0; i < k; i++) {
    const lid = ranked[i]![0]
    centers.set(lid, spherePoint(i, Math.max(k, 1), ring))
  }

  const nodes: Union3DNode[] = []
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const lid = louvainOfAttr(attrs.louvainId)
    const c = centers.get(lid) ?? { x: 0, y: 0, z: 0 }
    const j = jitter3(id, jitterScale)
    const degree = graph.degree(id)
    nodes.push({
      id,
      name: attrs.label || id,
      color: typeof attrs.color === 'string' ? attrs.color : '#a8a29e',
      val: Math.max(0.45, Number(attrs.size) || 1),
      kind: attrs.kind as NeoNodeKind,
      louvainId: lid,
      degree,
      heat: nebulaHeat(degree),
      communityId:
        typeof attrs.communityId === 'string' ? attrs.communityId : undefined,
      communityLabel:
        typeof attrs.communityLabel === 'string'
          ? attrs.communityLabel
          : undefined,
      charStart: attrs.charStart,
      charEnd: attrs.charEnd,
      properties: (attrs.properties as Record<string, unknown> | undefined) ?? {
        louvainId: lid,
        communityId: attrs.communityId,
        communityLabel: attrs.communityLabel,
      },
      x: c.x + j.x,
      y: c.y + j.y,
      z: c.z + j.z,
    })
  })

  const idSet = new Set(nodes.map((n) => n.id))
  const colorById = new Map(nodes.map((n) => [n.id, n.color]))
  const links: Union3DLink[] = []
  graph.forEachEdge((_e, _attrs, source, target) => {
    if (!idSet.has(source) || !idSet.has(target)) return
    links.push({
      source,
      target,
      sourceColor: colorById.get(source) ?? '#a8a29e',
      targetColor: colorById.get(target) ?? '#a8a29e',
    })
  })

  return { nodes, links, communities }
}
