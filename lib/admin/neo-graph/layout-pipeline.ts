import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { ForceAtlas2Settings } from 'graphology-layout-forceatlas2'
import type {
  NeoEdgeType,
  NeoFa2Settings,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'

export const BACKBONE_KINDS = new Set<NeoNodeKind>([
  'publication',
  'document',
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
  'assessment',
  'evidence_check',
  'citation',
  'method_run',
])

/** Publication-first parent chain for orbits / hierarchy placement. */
const PARENT_PRIORITY: NeoNodeKind[] = [
  'publication',
  'document',
  'segment',
  'utterance',
  'controversy',
  'viewpoint',
  'dispute',
  'proposition',
  'agent',
  'entity',
]

/**
 * Hierarchy edges pull harder; cross-cutting / shared edges stay softer so
 * FA2 refines clusters instead of collapsing shared hubs.
 */
const STAR_EDGE_WEIGHT: Partial<Record<NeoEdgeType, number>> = {
  PUBLISHED_BY: 1.8,
  CONTAINS: 1.6,
  GROUNDED_IN: 1.5,
  ASSERTED_BY: 1.0,
  MENTIONS: 0.7,
  REFERRED_AS: 0.6,
  EXPRESSES: 1.1,
  HAS_ROLE: 0.9,
  ADVANCES: 1.0,
  INCLUDES: 1.0,
  RELATES_TO: 0.9,
  CONCERNS: 0.9,
  VARIANT_OF: 0.8,
  ABOUT: 0.8,
  CHECKS: 0.85,
  CITES: 0.7,
  HELD_BY: 1.0,
  DERIVED_FROM: 0.9,
  PRODUCED_BY: 0.6,
}

const DEFAULT_EDGE_WEIGHT = 0.9

export const ORBIT_BASE_GAP = 28
export const ORBIT_SPREAD = 22
export const COLLISION_PADDING = 3
export const COLLISION_ITERATIONS = 10

const DOC_ORBIT = 72
const SEG_ORBIT = 36
const UTT_ORBIT = 28
const AGENT_ORBIT = 22

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
  return STAR_EDGE_WEIGHT[type] ?? DEFAULT_EDGE_WEIGHT
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
    if (!byKind.has(kind)) byKind.set(kind, neighborId)
  })
  for (const kind of PARENT_PRIORITY) {
    const id = byKind.get(kind)
    if (id) return id
  }
  return fallback
}

function neighborsOfKind(
  graph: NeoSigmaGraph,
  nodeId: string,
  kind: NeoNodeKind
): string[] {
  const out: string[] = []
  if (!graph.hasNode(nodeId)) return out
  graph.forEachNeighbor(nodeId, (neighborId) => {
    if (graph.getNodeAttribute(neighborId, 'kind') === kind) out.push(neighborId)
  })
  return out
}

function scatterPoint(
  id: string,
  scale: number
): { x: number; y: number } {
  const sx = hashSeed(id)
  const sy = hashSeed(`${id}:y`)
  return {
    x: ((sx % 1000) / 1000 - 0.5) * scale,
    y: ((sy % 1000) / 1000 - 0.5) * scale,
  }
}

function offsetFromParent(
  parentX: number,
  parentY: number,
  childId: string,
  radius: number,
  index: number,
  total: number
): { x: number; y: number } {
  const seed = hashSeed(childId)
  const baseAngle = ((seed % 360) * Math.PI) / 180
  const angle =
    total > 1 ? baseAngle + (index / total) * Math.PI * 2 : baseAngle
  const jitter = ((seed % 17) - 8) * 0.35
  const r = radius + jitter
  return {
    x: parentX + Math.cos(angle) * r,
    y: parentY + Math.sin(angle) * r,
  }
}

function centroidOf(
  graph: NeoSigmaGraph,
  ids: string[]
): { x: number; y: number } | null {
  if (ids.length === 0) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const id of ids) {
    if (!graph.hasNode(id)) continue
    sx += graph.getNodeAttribute(id, 'x')
    sy += graph.getNodeAttribute(id, 'y')
    n += 1
  }
  if (n === 0) return null
  return { x: sx / n, y: sy / n }
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
 * Used only for filter-new nodes so they appear near a settled parent
 * without restarting full FA2.
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

/** Publication ring radius so neighboring pubs keep breathing room. */
export function targetPublicationRingRadius(pubCount: number): number {
  const n = Math.max(pubCount, 1)
  const gap = 200
  return Math.max(360, (n * gap) / (2 * Math.PI))
}

/**
 * Place one node using the publication-first hierarchy rules.
 * Safe when parents are already positioned.
 */
export function placeNodeNearHierarchyParent(
  graph: NeoSigmaGraph,
  nodeId: string,
  siblingIndex = 0,
  siblingTotal = 1
): void {
  if (!graph.hasNode(nodeId)) return
  const kind = graph.getNodeAttribute(nodeId, 'kind') as NeoNodeKind
  if (kind === 'cluster' || graph.getNodeAttribute(nodeId, 'properties')?.lodSynthetic) {
    return
  }

  const scale = 420 + Math.sqrt(Math.max(graph.order, 1)) * 10

  if (kind === 'publication') {
    const pubs: string[] = []
    graph.forEachNode((id, attrs) => {
      if (attrs.kind === 'publication') pubs.push(id)
    })
    pubs.sort()
    const i = Math.max(0, pubs.indexOf(nodeId))
    const n = Math.max(pubs.length, 1)
    const radius = targetPublicationRingRadius(n)
    const angle = (2 * Math.PI * i) / n
    graph.setNodeAttribute(nodeId, 'x', Math.cos(angle) * radius)
    graph.setNodeAttribute(nodeId, 'y', Math.sin(angle) * radius)
    return
  }

  if (kind === 'document') {
    const pubs = neighborsOfKind(graph, nodeId, 'publication')
    const c = centroidOf(graph, pubs)
    if (c) {
      const pos = offsetFromParent(
        c.x,
        c.y,
        nodeId,
        DOC_ORBIT,
        siblingIndex,
        siblingTotal
      )
      graph.setNodeAttribute(nodeId, 'x', pos.x)
      graph.setNodeAttribute(nodeId, 'y', pos.y)
      return
    }
    const p = scatterPoint(nodeId, scale)
    graph.setNodeAttribute(nodeId, 'x', p.x)
    graph.setNodeAttribute(nodeId, 'y', p.y)
    return
  }

  if (kind === 'segment') {
    const docs = neighborsOfKind(graph, nodeId, 'document')
    const c = centroidOf(graph, docs)
    if (c) {
      const pos = offsetFromParent(
        c.x,
        c.y,
        nodeId,
        SEG_ORBIT,
        siblingIndex,
        siblingTotal
      )
      graph.setNodeAttribute(nodeId, 'x', pos.x)
      graph.setNodeAttribute(nodeId, 'y', pos.y)
      return
    }
  }

  if (kind === 'utterance') {
    const segs = neighborsOfKind(graph, nodeId, 'segment')
    const docs = neighborsOfKind(graph, nodeId, 'document')
    const c = centroidOf(graph, segs.length > 0 ? segs : docs)
    if (c) {
      const pos = offsetFromParent(
        c.x,
        c.y,
        nodeId,
        UTT_ORBIT,
        siblingIndex,
        siblingTotal
      )
      graph.setNodeAttribute(nodeId, 'x', pos.x)
      graph.setNodeAttribute(nodeId, 'y', pos.y)
      return
    }
  }

  if (kind === 'entity') {
    const utts = neighborsOfKind(graph, nodeId, 'utterance')
    const c = centroidOf(graph, utts)
    if (c) {
      const jitter = ((hashSeed(nodeId) % 21) - 10) * 0.8
      graph.setNodeAttribute(nodeId, 'x', c.x + jitter)
      graph.setNodeAttribute(nodeId, 'y', c.y - jitter)
      return
    }
  }

  if (kind === 'agent') {
    const utts = neighborsOfKind(graph, nodeId, 'utterance')
    const c = centroidOf(graph, utts)
    if (c) {
      const pos = offsetFromParent(
        c.x,
        c.y,
        nodeId,
        AGENT_ORBIT,
        siblingIndex,
        siblingTotal
      )
      graph.setNodeAttribute(nodeId, 'x', pos.x)
      graph.setNodeAttribute(nodeId, 'y', pos.y)
      return
    }
  }

  const parent = primaryParentId(graph, nodeId)
  if (parent && graph.hasNode(parent)) {
    const p = graph.getNodeAttributes(parent)
    const pos = offsetFromParent(
      p.x,
      p.y,
      nodeId,
      ORBIT_BASE_GAP + 12,
      siblingIndex,
      siblingTotal
    )
    graph.setNodeAttribute(nodeId, 'x', pos.x)
    graph.setNodeAttribute(nodeId, 'y', pos.y)
    return
  }

  const p = scatterPoint(nodeId, scale)
  graph.setNodeAttribute(nodeId, 'x', p.x)
  graph.setNodeAttribute(nodeId, 'y', p.y)
}

/**
 * Place newly visible nodes with the hierarchy rules (filter-new).
 * Order matters: pubs → docs → segs → utts → agents/entities → rest.
 */
export function placeNodesHierarchically(
  graph: NeoSigmaGraph,
  nodeIds: ReadonlySet<string> | string[]
): void {
  const ids = [...nodeIds].filter((id) => graph.hasNode(id))
  const byKind = (kind: NeoNodeKind) =>
    ids
      .filter((id) => graph.getNodeAttribute(id, 'kind') === kind)
      .sort((a, b) => a.localeCompare(b))

  const waves: NeoNodeKind[] = [
    'publication',
    'document',
    'segment',
    'utterance',
    'agent',
    'entity',
    'argument',
    'proposition',
    'dispute',
    'viewpoint',
    'controversy',
  ]

  const placed = new Set<string>()
  for (const kind of waves) {
    const group = byKind(kind)
    group.forEach((id, i) => {
      placeNodeNearHierarchyParent(graph, id, i, group.length)
      placed.add(id)
    })
  }
  for (const id of ids) {
    if (placed.has(id)) continue
    placeNodeNearHierarchyParent(graph, id)
  }
}

/**
 * Full hierarchical seed: publications as primary hubs, then docs / segments /
 * utterances / entity centroids / agents near utterances.
 */
export function seedHierarchicalPositions(graph: NeoSigmaGraph): void {
  const pubs: string[] = []
  const docs: string[] = []
  const segs: string[] = []
  const utts: string[] = []
  const ents: string[] = []
  const agents: string[] = []
  const other: string[] = []

  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster') return
    if (attrs.properties?.lodSynthetic === true) return
    switch (attrs.kind) {
      case 'publication':
        pubs.push(id)
        break
      case 'document':
        docs.push(id)
        break
      case 'segment':
        segs.push(id)
        break
      case 'utterance':
        utts.push(id)
        break
      case 'entity':
        ents.push(id)
        break
      case 'agent':
        agents.push(id)
        break
      default:
        other.push(id)
        break
    }
  })

  pubs.sort()
  docs.sort()
  segs.sort()
  utts.sort()
  ents.sort()
  agents.sort()
  other.sort()

  const pubRadius = targetPublicationRingRadius(pubs.length || 1)
  pubs.forEach((id, i) => {
    const n = Math.max(pubs.length, 1)
    const angle = (2 * Math.PI * i) / n
    graph.setNodeAttribute(id, 'x', Math.cos(angle) * pubRadius)
    graph.setNodeAttribute(id, 'y', Math.sin(angle) * pubRadius)
  })

  // Group documents by primary publication for even local orbits.
  const docsByPub = new Map<string, string[]>()
  const orphanDocs: string[] = []
  for (const id of docs) {
    const pubNeighbors = neighborsOfKind(graph, id, 'publication').sort()
    const pubId = pubNeighbors[0]
    if (!pubId) {
      orphanDocs.push(id)
      continue
    }
    const list = docsByPub.get(pubId)
    if (list) list.push(id)
    else docsByPub.set(pubId, [id])
  }
  for (const [pubId, group] of docsByPub) {
    group.sort()
    group.forEach((id, i) => {
      placeNodeNearHierarchyParent(graph, id, i, group.length)
      // Ensure we used the grouped pub even if multiple exist.
      if (graph.hasNode(pubId)) {
        const pub = graph.getNodeAttributes(pubId)
        const pos = offsetFromParent(
          pub.x,
          pub.y,
          id,
          DOC_ORBIT,
          i,
          group.length
        )
        graph.setNodeAttribute(id, 'x', pos.x)
        graph.setNodeAttribute(id, 'y', pos.y)
      }
    })
  }
  orphanDocs.forEach((id, i) => {
    placeNodeNearHierarchyParent(graph, id, i, orphanDocs.length)
  })

  const segsByDoc = new Map<string, string[]>()
  for (const id of segs) {
    const docNeighbors = neighborsOfKind(graph, id, 'document').sort()
    const docId = docNeighbors[0] ?? '__orphan__'
    const list = segsByDoc.get(docId)
    if (list) list.push(id)
    else segsByDoc.set(docId, [id])
  }
  for (const [, group] of segsByDoc) {
    group.sort()
    group.forEach((id, i) =>
      placeNodeNearHierarchyParent(graph, id, i, group.length)
    )
  }

  const uttsByParent = new Map<string, string[]>()
  for (const id of utts) {
    const segsN = neighborsOfKind(graph, id, 'segment').sort()
    const docsN = neighborsOfKind(graph, id, 'document').sort()
    const parentId = segsN[0] ?? docsN[0] ?? '__orphan__'
    const list = uttsByParent.get(parentId)
    if (list) list.push(id)
    else uttsByParent.set(parentId, [id])
  }
  for (const [, group] of uttsByParent) {
    group.sort()
    group.forEach((id, i) =>
      placeNodeNearHierarchyParent(graph, id, i, group.length)
    )
  }

  ents.forEach((id) => placeNodeNearHierarchyParent(graph, id))

  const agentsByUtt = new Map<string, string[]>()
  for (const id of agents) {
    const uttNeighbors = neighborsOfKind(graph, id, 'utterance').sort()
    const parentId = uttNeighbors[0] ?? '__orphan__'
    const list = agentsByUtt.get(parentId)
    if (list) list.push(id)
    else agentsByUtt.set(parentId, [id])
  }
  for (const [, group] of agentsByUtt) {
    group.sort()
    group.forEach((id, i) =>
      placeNodeNearHierarchyParent(graph, id, i, group.length)
    )
  }

  other.forEach((id) => placeNodeNearHierarchyParent(graph, id))
}

/**
 * Soft settle budget after hierarchical seed.
 * Long enough for repulsion to open the tight seed before we freeze.
 */
export function workerBudgetMs(order: number): number {
  return Math.min(1600 + order / 10, 7000)
}

/**
 * Soft FA2 refine after hierarchical seed.
 */
export function buildFa2WorkerSettings(
  graph: NeoSigmaGraph,
  user?: NeoFa2Settings
): ForceAtlas2Settings {
  const inferred = forceAtlas2.inferSettings(graph.order)
  return {
    ...inferred,
    adjustSizes: true,
    strongGravityMode: false,
    edgeWeightInfluence: 1,
    gravity: user?.gravity ?? inferred.gravity ?? 0.01,
    scalingRatio: user?.scalingRatio ?? inferred.scalingRatio ?? 200,
    slowDown: Math.max(inferred.slowDown ?? 5, 5),
  }
}

/** @deprecated Prefer seedHierarchicalPositions for full layouts. */
export function seedOrganicPositions(graph: NeoSigmaGraph): void {
  seedHierarchicalPositions(graph)
}

export function computeDocumentLeafCounts(
  graph: NeoSigmaGraph
): Map<string, number> {
  const counts = new Map<string, number>()
  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'document') return
    let leaves = 0
    graph.forEachNeighbor(id, (neighborId) => {
      const kind = graph.getNodeAttribute(neighborId, 'kind') as NeoNodeKind
      if (isLeafKind(kind)) leaves += 1
    })
    counts.set(id, leaves)
    graph.setNodeAttribute(id, 'leafCount', leaves)
  })
  return counts
}

/**
 * Spatial-hash size-aware separation so discs do not stack.
 * When `pinKind` returns true, that node is not moved (used to protect hubs).
 */
export function separateOverlaps(
  graph: NeoSigmaGraph,
  iterations = COLLISION_ITERATIONS,
  padding = COLLISION_PADDING,
  options?: { pinKind?: (kind: NeoNodeKind) => boolean }
): void {
  if (graph.order < 2) return
  const pinKind = options?.pinKind

  const cappedIters =
    graph.order > 5000 ? Math.min(iterations, 4) : iterations

  let maxSize = 1
  graph.forEachNode((_id, attrs) => {
    if (attrs.size > maxSize) maxSize = attrs.size
  })
  const cellSize = Math.max(4, maxSize * 2 + padding)

  for (let iter = 0; iter < cappedIters; iter++) {
    const cells = new Map<string, string[]>()
    graph.forEachNode((id, attrs) => {
      if (attrs.lodHidden) return
      const cx = Math.floor(attrs.x / cellSize)
      const cy = Math.floor(attrs.y / cellSize)
      const key = `${cx}:${cy}`
      const list = cells.get(key)
      if (list) list.push(id)
      else cells.set(key, [id])
    })

    graph.forEachNode((id, attrs) => {
      if (attrs.lodHidden) return
      const pinned = Boolean(pinKind?.(attrs.kind))
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
            if (other.lodHidden) continue
            const otherPinned = Boolean(pinKind?.(other.kind))
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
            if (!pinned && !otherPinned) {
              dx += vx * push
              dy += vy * push
              hits += 1
              graph.setNodeAttribute(otherId, 'x', other.x - vx * push)
              graph.setNodeAttribute(otherId, 'y', other.y - vy * push)
            } else if (pinned && !otherPinned) {
              graph.setNodeAttribute(otherId, 'x', other.x - vx * push * 2)
              graph.setNodeAttribute(otherId, 'y', other.y - vy * push * 2)
            } else if (!pinned && otherPinned) {
              dx += vx * push * 2
              dy += vy * push * 2
              hits += 1
            }
          }
        }
      }

      if (hits > 0 && !pinned) {
        graph.setNodeAttribute(id, 'x', attrs.x + dx / hits)
        graph.setNodeAttribute(id, 'y', attrs.y + dy / hits)
      }
    })
  }
}
