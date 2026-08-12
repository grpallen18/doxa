import louvain from 'graphology-communities-louvain'
import {
  applyNebulaHeat,
  nebulaHeat,
  NEBULA_HOT_HEAT,
} from '@/lib/admin/neo-graph/appearance'
import { deriveNeoBorderColor } from '@/lib/admin/neo-graph/colors'
import {
  edgeLayoutWeight,
  hashSeed,
} from '@/lib/admin/neo-graph/layout-pipeline'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'
import type { NeoGraphCommunity } from '@/lib/admin/neo-graph/types'
import {
  NEBULA_SEED_SCALE,
  seedOntologyIslandPositions,
} from '@/lib/admin/neo-graph/island-layout'

export const NEBULA_RESOLUTION_DEFAULT = 35
export const NEBULA_RESOLUTION_MIN = 1
export const NEBULA_RESOLUTION_MAX = 100

/** Lobe ring as % of seed disk radius — higher = more separated color zones. */
export const NEBULA_BLEND_DEFAULT = 60
export const NEBULA_BLEND_MIN = 0
export const NEBULA_BLEND_MAX = 100

/** Readable nebula: dial maps to this many color patches. */
export const NEBULA_CLUSTER_MIN = 3
export const NEBULA_CLUSTER_MAX = 8

/** Low Louvain γ so we under-partition, then merge down to the dial target. */
const LOUVAIN_BASE_RESOLUTION = 0.05

function clampDial(dial: number): number {
  return Math.max(
    NEBULA_RESOLUTION_MIN,
    Math.min(NEBULA_RESOLUTION_MAX, dial)
  )
}

/** Dial 1 → 3 clusters, dial 100 → 8. */
export function dialToTargetClusters(dial: number): number {
  const d = clampDial(dial)
  const t = (d - 1) / (NEBULA_RESOLUTION_MAX - 1)
  return Math.round(
    NEBULA_CLUSTER_MIN + t * (NEBULA_CLUSTER_MAX - NEBULA_CLUSTER_MIN)
  )
}

/** @deprecated Prefer dialToTargetClusters — kept for call-site clarity. */
export function dialToLouvainResolution(dial: number): number {
  return LOUVAIN_BASE_RESOLUTION
}

function seededRng(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}

function louvainOf(graph: NeoSigmaGraph, id: string): string {
  const raw = graph.getNodeAttribute(id, 'louvainId')
  if (typeof raw === 'string' && raw) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return `louvain:${raw}`
  return 'louvain:none'
}

/** Evenly spaced hues — few clusters stay easy to tell apart. */
export function louvainRankColor(rank: number, total: number): string {
  const n = Math.max(total, 1)
  const hue = ((rank % n) * 360) / n
  const sat = 64 + (rank % 3) * 5
  const light = 64 + (rank % 2) * 6
  return hslToHex(hue, sat, light)
}

function hslToHex(h: number, s: number, l: number): string {
  const S = Math.max(0, Math.min(100, s)) / 100
  const L = Math.max(0, Math.min(100, l)) / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const Hp = (((h % 360) + 360) % 360) / 60
  const X = C * (1 - Math.abs((Hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (Hp < 1) {
    r = C
    g = X
  } else if (Hp < 2) {
    r = X
    g = C
  } else if (Hp < 3) {
    g = C
    b = X
  } else if (Hp < 4) {
    g = X
    b = C
  } else if (Hp < 5) {
    r = X
    b = C
  } else {
    r = C
    b = X
  }
  const m = L - C / 2
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function normalizeLouvainId(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return `louvain:${raw}`
  if (typeof raw === 'string' && raw) {
    return raw.startsWith('louvain:') ? raw : `louvain:${raw}`
  }
  return 'louvain:none'
}

/**
 * Merge smallest communities into the neighbor they share the most edges with
 * until we hit `target` patches.
 */
function mergeCommunitiesToTarget(
  graph: NeoSigmaGraph,
  target: number
): Map<string, number> {
  const counts = new Map<string, number>()
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const lid = louvainOf(graph, id)
    counts.set(lid, (counts.get(lid) ?? 0) + 1)
  })

  const edgeWeightBetween = (
    a: string,
    b: string,
    cut: Map<string, number>
  ): number => cut.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? 0

  const buildCutWeights = (): Map<string, number> => {
    const cut = new Map<string, number>()
    graph.forEachEdge((_e, attrs, source, targetNode) => {
      const sc = louvainOf(graph, source)
      const tc = louvainOf(graph, targetNode)
      if (sc === tc) return
      const key = sc < tc ? `${sc}|${tc}` : `${tc}|${sc}`
      const ew =
        typeof attrs.weight === 'number' && Number.isFinite(attrs.weight)
          ? attrs.weight
          : 1
      cut.set(key, (cut.get(key) ?? 0) + ew)
    })
    return cut
  }

  while (counts.size > target) {
    const cut = buildCutWeights()
    const smallest = [...counts.entries()].sort(
      (a, b) => a[1] - b[1] || a[0].localeCompare(b[0])
    )[0]?.[0]
    if (!smallest) break

    let best: string | null = null
    let bestW = -1
    for (const other of counts.keys()) {
      if (other === smallest) continue
      const w = edgeWeightBetween(smallest, other, cut)
      const size = counts.get(other) ?? 0
      const score = w * 1000 + size
      if (score > bestW || (score === bestW && other < (best ?? ''))) {
        bestW = score
        best = other
      }
    }
    if (!best) {
      best = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      )[0]?.[0]
    }
    if (!best || best === smallest) break

    graph.forEachNode((id, attrs) => {
      if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
      if (louvainOf(graph, id) === smallest) {
        graph.setNodeAttribute(id, 'louvainId', best)
      }
    })
    counts.set(best, (counts.get(best) ?? 0) + (counts.get(smallest) ?? 0))
    counts.delete(smallest)
  }

  return counts
}

/**
 * Partition with Louvain, merge to dial target (3–8), paint by rank.
 * Ontology communityId is left intact.
 */
export function applyLouvainNebula(
  graph: NeoSigmaGraph,
  options?: { resolutionDial?: number }
): { communities: NeoGraphCommunity[]; count: number } {
  const dial = clampDial(options?.resolutionDial ?? NEBULA_RESOLUTION_DEFAULT)
  const target = dialToTargetClusters(dial)

  if (graph.order < 2 || graph.size < 1) {
    return { communities: [], count: 0 }
  }

  graph.forEachEdge((edge, attrs) => {
    graph.setEdgeAttribute(edge, 'weight', edgeLayoutWeight(attrs.edgeType))
  })

  louvain.assign(graph, {
    resolution: LOUVAIN_BASE_RESOLUTION,
    getEdgeWeight: 'weight',
    nodeCommunityAttribute: 'louvainId',
    rng: seededRng(hashSeed(`louvain:${dial}:${graph.order}:${graph.size}`)),
  })

  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    graph.setNodeAttribute(
      id,
      'louvainId',
      normalizeLouvainId(graph.getNodeAttribute(id, 'louvainId'))
    )
  })

  const counts = mergeCommunitiesToTarget(graph, target)

  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )
  const rankOf = new Map(ranked.map(([id], i) => [id, i]))
  const total = ranked.length

  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const louvainId = louvainOf(graph, id)
    const rank = rankOf.get(louvainId) ?? 0
    const base = louvainRankColor(rank, total)
    const degree = graph.degree(id)
    const heat = nebulaHeat(degree)
    graph.setNodeAttribute(
      id,
      'color',
      heat >= 0.12 ? applyNebulaHeat(base, degree) : base
    )
    graph.setNodeAttribute(id, 'borderColor', deriveNeoBorderColor(base))
    graph.setNodeAttribute(id, 'hot', heat >= NEBULA_HOT_HEAT)
  })

  const communities: NeoGraphCommunity[] = ranked.map(([id, memberCount], i) => ({
    id,
    label: `Cluster ${i + 1}`,
    kind: 'unlinked' as const,
    memberCount,
    color: louvainRankColor(i, total),
  }))

  return { communities, count: communities.length }
}

/**
 * Overlapping Louvain lobes inside one disk — teammates start near each other,
 * but centroids sit close to the origin so FA2 gravity keeps a single brain-blob
 * (not a community ring / mandala).
 *
 * `blend` is lobe ring as % of seed scale (default 20). Jitter stays wide so
 * lobes overlap; raise blend to open color zones, lower to fuse the blob.
 */
const LOBE_JITTER_FRAC = 0.72

function clampBlend(blend: number): number {
  if (!Number.isFinite(blend)) return NEBULA_BLEND_DEFAULT
  return Math.max(NEBULA_BLEND_MIN, Math.min(NEBULA_BLEND_MAX, Math.round(blend)))
}

export function blendToLobeRingFrac(blend: number): number {
  return clampBlend(blend) / 100
}

export function seedLouvainSoftPositions(
  graph: NeoSigmaGraph,
  options?: { blend?: number }
): void {
  const counts = new Map<string, number>()
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const lid = louvainOf(graph, id)
    counts.set(lid, (counts.get(lid) ?? 0) + 1)
  })

  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )
  const k = ranked.length
  if (k === 0) {
    seedOntologyIslandPositions(graph)
    return
  }

  const ring = NEBULA_SEED_SCALE * blendToLobeRingFrac(options?.blend ?? NEBULA_BLEND_DEFAULT)
  const jitterScale = NEBULA_SEED_SCALE * LOBE_JITTER_FRAC
  const centers = new Map<string, { x: number; y: number }>()
  for (let i = 0; i < k; i++) {
    const lid = ranked[i]![0]
    if (k === 1) {
      centers.set(lid, { x: 0, y: 0 })
      continue
    }
    const angle = (2 * Math.PI * i) / k - Math.PI / 2
    centers.set(lid, {
      x: Math.cos(angle) * ring,
      y: Math.sin(angle) * ring,
    })
  }

  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const c = centers.get(louvainOf(graph, id)) ?? { x: 0, y: 0 }
    const sx = hashSeed(`${id}:lobe`)
    const sy = hashSeed(`${id}:lobe:y`)
    const jx = ((sx % 1000) / 1000 - 0.5) * jitterScale
    const jy = ((sy % 1000) / 1000 - 0.5) * jitterScale
    graph.setNodeAttribute(id, 'x', c.x + jx)
    graph.setNodeAttribute(id, 'y', c.y + jy)
    graph.setNodeAttribute(id, 'fixed', false)
  })
}
