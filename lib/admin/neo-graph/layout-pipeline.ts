import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type {
  NeoEdgeType,
  NeoFa2Settings,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import type {
  NeoSigmaGraph,
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/lib/admin/neo-graph/graphology-adapter'

export const BACKBONE_KINDS = new Set<NeoNodeKind>([
  'document',
  'publication',
  'controversy',
  'viewpoint',
  'dispute',
  'proposition',
])

export const LEAF_KINDS = new Set<NeoNodeKind>([
  'entity',
  'agent',
  'utterance',
  'segment',
  'argument',
])

const PARENT_PRIORITY: NeoNodeKind[] = [
  'document',
  'publication',
  'controversy',
  'viewpoint',
  'dispute',
  'proposition',
]

const STAR_EDGE_WEIGHT: Partial<Record<NeoEdgeType, number>> = {
  MENTIONS: 0.25,
  CONTAINS: 0.25,
  GROUNDED_IN: 0.25,
  REFERRED_AS: 0.25,
  ASSERTED_BY: 0.25,
  PUBLISHED_BY: 0.6,
}

export const ORBIT_BASE_GAP = 18
export const ORBIT_SPREAD = 14
export const COLLISION_PADDING = 2
export const COLLISION_ITERATIONS = 10

export function isBackboneKind(kind: NeoNodeKind): boolean {
  return BACKBONE_KINDS.has(kind)
}

export function isLeafKind(kind: NeoNodeKind): boolean {
  return LEAF_KINDS.has(kind)
}

export function hashSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function edgeLayoutWeight(type: NeoEdgeType): number {
  return STAR_EDGE_WEIGHT[type] ?? 1
}

export function assignEdgeWeights(graph: NeoSigmaGraph): void {
  graph.forEachEdge((edge, attrs) => {
    graph.setEdgeAttribute(edge, 'weight', edgeLayoutWeight(attrs.edgeType))
  })
}

export function primaryParentId(
  graph: NeoSigmaGraph,
  nodeId: string
): string | null {
  if (!graph.hasNode(nodeId)) return null
  const byKind = new Map<NeoNodeKind, string>()
  let fallback: string | null = null
  graph.forEachNeighbor(nodeId, (neighborId) => {
    const kind = graph.getNodeAttribute(neighborId, 'kind') as NeoNodeKind
    if (!fallback) fallback = neighborId
    if (isBackboneKind(kind) && !byKind.has(kind)) {
      byKind.set(kind, neighborId)
    }
  })
  for (const kind of PARENT_PRIORITY) {
    const id = byKind.get(kind)
    if (id) return id
  }
  return fallback
}

function orbitRadius(
  parentSize: number,
  leafSize: number,
  childCount: number,
  ringIndex: number
): number {
  const base =
    parentSize + leafSize + ORBIT_BASE_GAP + ORBIT_SPREAD * Math.sqrt(childCount)
  return base + ringIndex * (leafSize * 2 + ORBIT_BASE_GAP * 0.6)
}

/**
 * Place leaf nodes on circles around their primary parent.
 * When `onlyNodeIds` is set, only those leaves are repositioned (filter-new).
 */
export function placeLeavesInOrbits(
  graph: NeoSigmaGraph,
  options?: { onlyNodeIds?: ReadonlySet<string> }
): void {
  const only = options?.onlyNodeIds
  const groups = new Map<string, string[]>()

  graph.forEachNode((id, attrs) => {
    if (!isLeafKind(attrs.kind)) return
    if (only && !only.has(id)) return
    const parent = primaryParentId(graph, id)
    if (!parent || !graph.hasNode(parent)) return
    const list = groups.get(parent)
    if (list) list.push(id)
    else groups.set(parent, [id])
  })

  for (const [parentId, children] of groups) {
    children.sort((a, b) => a.localeCompare(b))
    const parent = graph.getNodeAttributes(parentId)
    const n = children.length
    const perRing = Math.max(8, Math.ceil(Math.sqrt(n) * 4))

    children.forEach((childId, index) => {
      const ringIndex = Math.floor(index / perRing)
      const indexInRing = index % perRing
      const ringCount = Math.min(perRing, n - ringIndex * perRing)
      const child = graph.getNodeAttributes(childId)
      const seed = hashSeed(childId)
      const baseAngle = ((seed % 360) * Math.PI) / 180
      const angle = baseAngle + (indexInRing / ringCount) * Math.PI * 2
      const r = orbitRadius(parent.size, child.size, n, ringIndex)
      graph.setNodeAttribute(childId, 'x', parent.x + Math.cos(angle) * r)
      graph.setNodeAttribute(childId, 'y', parent.y + Math.sin(angle) * r)
    })
  }
}

function buildFa2Settings(settings: NeoFa2Settings) {
  return {
    barnesHutOptimize: true,
    linLogMode: true,
    outboundAttractionDistribution: true,
    adjustSizes: true,
    slowDown: 10,
    gravity: settings.gravity,
    scalingRatio: settings.scalingRatio,
  }
}

/**
 * Run sync FA2 on backbone-only subgraph, then copy positions back.
 */
export function layoutBackboneSync(
  graph: NeoSigmaGraph,
  settings: NeoFa2Settings,
  iterations: number
): void {
  const backbone = new Graph<SigmaNodeAttributes, SigmaEdgeAttributes>({
    multi: false,
    type: 'directed',
    allowSelfLoops: false,
  })

  graph.forEachNode((id, attrs) => {
    if (!isBackboneKind(attrs.kind)) return
    backbone.addNode(id, { ...attrs })
  })

  if (backbone.order < 2) return

  graph.forEachEdge((edge, attrs, source, target) => {
    if (!backbone.hasNode(source) || !backbone.hasNode(target)) return
    if (backbone.hasEdge(source, target) || backbone.hasEdge(target, source)) {
      return
    }
    if (backbone.hasEdge(edge)) return
    backbone.addEdgeWithKey(edge, source, target, {
      ...attrs,
      weight: edgeLayoutWeight(attrs.edgeType),
    })
  })

  forceAtlas2.assign(backbone, {
    iterations,
    getEdgeWeight: 'weight',
    settings: buildFa2Settings(settings),
  })

  backbone.forEachNode((id, attrs) => {
    if (!graph.hasNode(id)) return
    graph.setNodeAttribute(id, 'x', attrs.x)
    graph.setNodeAttribute(id, 'y', attrs.y)
  })
}

/**
 * Spatial-hash size-aware separation so discs do not stack.
 */
export function separateOverlaps(
  graph: NeoSigmaGraph,
  iterations = COLLISION_ITERATIONS,
  padding = COLLISION_PADDING
): void {
  if (graph.order < 2) return

  let maxSize = 1
  graph.forEachNode((_id, attrs) => {
    if (attrs.size > maxSize) maxSize = attrs.size
  })
  const cellSize = Math.max(4, maxSize * 2 + padding)

  for (let iter = 0; iter < iterations; iter++) {
    const cells = new Map<string, string[]>()
    graph.forEachNode((id, attrs) => {
      const cx = Math.floor(attrs.x / cellSize)
      const cy = Math.floor(attrs.y / cellSize)
      const key = `${cx}:${cy}`
      const list = cells.get(key)
      if (list) list.push(id)
      else cells.set(key, [id])
    })

    graph.forEachNode((id, attrs) => {
      const cx = Math.floor(attrs.x / cellSize)
      const cy = Math.floor(attrs.y / cellSize)
      let dx = 0
      let dy = 0
      let hits = 0

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const neighbors = cells.get(`${cx + ox}:${cy + oy}`)
          if (!neighbors) continue
          for (const otherId of neighbors) {
            if (otherId <= id) continue
            const other = graph.getNodeAttributes(otherId)
            const minDist = attrs.size + other.size + padding
            let vx = attrs.x - other.x
            let vy = attrs.y - other.y
            let dist = Math.hypot(vx, vy)
            if (dist >= minDist) continue
            if (dist < 1e-6) {
              const seed = hashSeed(id + otherId)
              const angle = ((seed % 360) * Math.PI) / 180
              vx = Math.cos(angle)
              vy = Math.sin(angle)
              dist = 1e-6
            }
            const push = ((minDist - dist) / dist) * 0.5
            dx += vx * push
            dy += vy * push
            hits += 1
            graph.setNodeAttribute(otherId, 'x', other.x - vx * push)
            graph.setNodeAttribute(otherId, 'y', other.y - vy * push)
          }
        }
      }

      if (hits > 0) {
        graph.setNodeAttribute(id, 'x', attrs.x + dx)
        graph.setNodeAttribute(id, 'y', attrs.y + dy)
      }
    })
  }
}

/** Count leaf neighbors per document for LOD density cues. */
export function computeDocumentLeafCounts(
  graph: NeoSigmaGraph
): Map<string, number> {
  const counts = new Map<string, number>()
  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'document') return
    let n = 0
    graph.forEachNeighbor(id, (neighborId) => {
      const kind = graph.getNodeAttribute(neighborId, 'kind') as NeoNodeKind
      if (isLeafKind(kind)) n += 1
    })
    counts.set(id, n)
    graph.setNodeAttribute(id, 'leafCount', n)
  })
  return counts
}

export function buildWorkerFa2Settings(settings: NeoFa2Settings) {
  return {
    getEdgeWeight: 'weight' as const,
    settings: {
      ...buildFa2Settings(settings),
    },
  }
}

export const BACKBONE_ITERS_INITIAL = 400
export const BACKBONE_ITERS_RELAYOUT = 200
