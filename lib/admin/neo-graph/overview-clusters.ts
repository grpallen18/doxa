import {
  deriveNeoBorderColor,
  getNeoKindColor,
} from '@/lib/admin/neo-graph/colors'
import { resolveCommunityAppearance } from '@/lib/admin/neo-graph/community-colors'
import {
  COMMUNITY_BRIDGE,
  COMMUNITY_UNLINKED,
} from '@/lib/admin/neo-graph/community-ids'
import { NEO_LABEL_COLOR_IDLE } from '@/lib/admin/neo-graph/appearance'
import { hashSeed } from '@/lib/admin/neo-graph/layout-pipeline'
import type {
  NeoSigmaGraph,
  SigmaEdgeAttributes,
  SigmaNodeAttributes,
} from '@/lib/admin/neo-graph/graphology-adapter'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

export type OverviewCluster = {
  id: string
  memberIds: string[]
  x: number
  y: number
  storyCount: number
  leafCountSum: number
  label: string
  communityId?: string
}

export type OverviewClusterMode = 'spatial' | 'membership'

const CLUSTER_ID_PREFIX = 'lod-cluster:'
const CLUSTER_EDGE_PREFIX = 'lod-cluster-edge:'

export function isLodClusterNodeId(id: string): boolean {
  return id.startsWith(CLUSTER_ID_PREFIX)
}

export function isLodClusterEdgeId(id: string): boolean {
  return id.startsWith(CLUSTER_EDGE_PREFIX)
}

function clusterIdForMembers(memberIds: string[]): string {
  const sorted = [...memberIds].sort()
  return `${CLUSTER_ID_PREFIX}${hashSeed(sorted.join('|'))}`
}

function clusterEdgeId(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a]
  return `${CLUSTER_EDGE_PREFIX}${x}||${y}`
}

function parseClusterEdgeId(edgeId: string): { source: string; target: string } | null {
  if (!edgeId.startsWith(CLUSTER_EDGE_PREFIX)) return null
  const body = edgeId.slice(CLUSTER_EDGE_PREFIX.length)
  const sep = body.indexOf('||')
  if (sep < 0) return null
  return {
    source: body.slice(0, sep),
    target: body.slice(sep + 2),
  }
}

class UnionFind {
  private parent = new Map<string, string>()

  find(id: string): string {
    let p = this.parent.get(id) ?? id
    if (!this.parent.has(id)) this.parent.set(id, id)
    while (p !== (this.parent.get(p) ?? p)) {
      const grand = this.parent.get(p) ?? p
      this.parent.set(p, this.parent.get(grand) ?? grand)
      p = this.parent.get(p) ?? p
    }
    return p
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    this.parent.set(ra, rb)
  }
}

function documentBBoxDiagonal(graph: NeoSigmaGraph): number {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let n = 0
  graph.forEachNode((_id, attrs) => {
    if (attrs.kind !== 'document') return
    n += 1
    if (attrs.x < minX) minX = attrs.x
    if (attrs.x > maxX) maxX = attrs.x
    if (attrs.y < minY) minY = attrs.y
    if (attrs.y > maxY) maxY = attrs.y
  })
  if (n < 2) return 100
  return Math.hypot(maxX - minX, maxY - minY) || 100
}

/**
 * Spatial union-find over document nodes.
 * Threshold = max(floor, 0.08 * bbox diagonal).
 */
export function computeOverviewClusters(
  graph: NeoSigmaGraph
): OverviewCluster[] {
  const docs: Array<{ id: string; x: number; y: number; leafCount: number }> =
    []
  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'document') return
    docs.push({
      id,
      x: attrs.x,
      y: attrs.y,
      leafCount:
        typeof attrs.leafCount === 'number' && Number.isFinite(attrs.leafCount)
          ? attrs.leafCount
          : 0,
    })
  })

  if (docs.length === 0) return []

  const diagonal = documentBBoxDiagonal(graph)
  // Prefer local density (median nearest neighbor) over a flat floor so a
  // partially collapsed layout does not become one mega-cluster at dist≤36.
  const nearest: number[] = []
  for (let i = 0; i < docs.length; i++) {
    let best = Infinity
    for (let j = 0; j < docs.length; j++) {
      if (i === j) continue
      const d = Math.hypot(docs[i].x - docs[j].x, docs[i].y - docs[j].y)
      if (d < best) best = d
    }
    if (Number.isFinite(best)) nearest.push(best)
  }
  nearest.sort((a, b) => a - b)
  const medianNn =
    nearest.length > 0 ? nearest[Math.floor(nearest.length / 2)] : 80
  const threshold = Math.min(
    Math.max(medianNn * 1.2, 20),
    Math.max(diagonal * 0.045, 24)
  )

  const uf = new UnionFind()
  for (const d of docs) uf.find(d.id)

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i]
      const b = docs[j]
      if (Math.hypot(a.x - b.x, a.y - b.y) < threshold) {
        uf.union(a.id, b.id)
      }
    }
  }

  const groups = new Map<string, typeof docs>()
  for (const d of docs) {
    const root = uf.find(d.id)
    const list = groups.get(root)
    if (list) list.push(d)
    else groups.set(root, [d])
  }

  const clusters: OverviewCluster[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const memberIds = members.map((m) => m.id).sort()
    let sx = 0
    let sy = 0
    let leafSum = 0
    for (const m of members) {
      sx += m.x
      sy += m.y
      leafSum += m.leafCount
    }
    const n = members.length
    clusters.push({
      id: clusterIdForMembers(memberIds),
      memberIds,
      x: sx / n,
      y: sy / n,
      storyCount: n,
      leafCountSum: leafSum,
      label: `${n} stories`,
    })
  }
  return clusters
}

/**
 * Group documents by ontology community (Union 2.0 overview).
 */
export function computeMembershipClusters(
  graph: NeoSigmaGraph
): OverviewCluster[] {
  const groups = new Map<
    string,
    Array<{ id: string; x: number; y: number; leafCount: number; label: string }>
  >()

  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'document') return
    const communityId =
      typeof attrs.communityId === 'string' && attrs.communityId
        ? attrs.communityId
        : COMMUNITY_UNLINKED
    if (communityId === COMMUNITY_BRIDGE) return
    const list = groups.get(communityId)
    const row = {
      id,
      x: attrs.x,
      y: attrs.y,
      leafCount:
        typeof attrs.leafCount === 'number' && Number.isFinite(attrs.leafCount)
          ? attrs.leafCount
          : 0,
      label:
        typeof attrs.communityLabel === 'string' && attrs.communityLabel
          ? attrs.communityLabel
          : communityId,
    }
    if (list) list.push(row)
    else groups.set(communityId, [row])
  })

  const clusters: OverviewCluster[] = []
  for (const [communityId, members] of groups) {
    if (members.length < 2) continue
    let sx = 0
    let sy = 0
    let leafSum = 0
    for (const m of members) {
      sx += m.x
      sy += m.y
      leafSum += m.leafCount
    }
    const n = members.length
    clusters.push({
      id: `${CLUSTER_ID_PREFIX}membership:${communityId}`,
      memberIds: members.map((m) => m.id).sort(),
      x: sx / n,
      y: sy / n,
      storyCount: n,
      leafCountSum: leafSum,
      label: members[0]?.label || `${n} stories`,
      communityId,
    })
  }
  return clusters
}

function clusterAppearance(
  storyCount: number,
  communityId?: string
): {
  size: number
  color: string
  borderColor: string
} {
  const painted = communityId
    ? resolveCommunityAppearance(communityId)
    : {
        color: getNeoKindColor('cluster'),
        borderColor: deriveNeoBorderColor(getNeoKindColor('cluster')),
      }
  const size = communityId
    ? Math.min(18, 8 + Math.sqrt(storyCount) * 2.2)
    : Math.min(48, 22 + Math.sqrt(storyCount) * 6)
  return {
    size,
    color: painted.color,
    borderColor: painted.borderColor,
  }
}

function ensureClusterNode(
  graph: NeoSigmaGraph,
  cluster: OverviewCluster
): void {
  const appearance = clusterAppearance(cluster.storyCount, cluster.communityId)
  const attrs: SigmaNodeAttributes = {
    label: cluster.label,
    fullLabel: cluster.label,
    kind: 'cluster',
    size: appearance.size,
    baseSize: appearance.size,
    color: appearance.color,
    borderColor: appearance.borderColor,
    labelColor: NEO_LABEL_COLOR_IDLE,
    x: cluster.x,
    y: cluster.y,
    zIndex: 120,
    forceLabel: true,
    lodHidden: false,
    leafCount: cluster.leafCountSum,
    memberIds: cluster.memberIds,
    properties: {
      lodSynthetic: true,
      storyCount: cluster.storyCount,
      leafCountSum: cluster.leafCountSum,
      communityId: cluster.communityId ?? null,
    },
    communityId: cluster.communityId,
    aliases: [],
  }
  if (graph.hasNode(cluster.id)) {
    graph.replaceNodeAttributes(cluster.id, attrs)
  } else {
    graph.addNode(cluster.id, attrs)
  }
}

function memberToCluster(clusters: OverviewCluster[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of clusters) {
    for (const m of c.memberIds) map.set(m, c.id)
  }
  return map
}

/**
 * Hide single-cluster publications; keep pubs that bridge 2+ clusters.
 * Add aggregated cluster–cluster edges via shared pub/entity neighbors.
 */
function applyBridgesAndPubs(
  graph: NeoSigmaGraph,
  _clusters: OverviewCluster[],
  docToCluster: Map<string, string>
): void {
  const bridgeWeight = new Map<string, number>()

  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'publication' && attrs.kind !== 'entity') return

    const touchedClusters = new Set<string>()
    graph.forEachNeighbor(id, (neighborId) => {
      const clusterId = docToCluster.get(neighborId)
      if (clusterId) touchedClusters.add(clusterId)
    })

    if (attrs.kind === 'publication') {
      graph.setNodeAttribute(
        id,
        'lodHidden',
        touchedClusters.size < 2
      )
    }

    const clusterKeys = [...touchedClusters]
    for (let i = 0; i < clusterKeys.length; i++) {
      for (let j = i + 1; j < clusterKeys.length; j++) {
        const edgeId = clusterEdgeId(clusterKeys[i], clusterKeys[j])
        bridgeWeight.set(edgeId, (bridgeWeight.get(edgeId) ?? 0) + 1)
      }
    }
  })

  const liveEdgeIds = new Set(bridgeWeight.keys())
  const toDrop: string[] = []
  graph.forEachEdge((edge) => {
    if (isLodClusterEdgeId(edge) && !liveEdgeIds.has(edge)) toDrop.push(edge)
  })
  for (const edge of toDrop) {
    if (graph.hasEdge(edge)) graph.dropEdge(edge)
  }

  for (const [edgeId, weight] of bridgeWeight) {
    const ends = parseClusterEdgeId(edgeId)
    if (!ends) continue
    const { source, target } = ends
    if (!graph.hasNode(source) || !graph.hasNode(target)) continue

    const edgeAttrs: SigmaEdgeAttributes = {
      label: 'cluster-link',
      type: 'curvedArrow',
      edgeType: 'RELATES_TO',
      size: Math.min(4, 0.8 + weight * 0.35),
      color: 'rgba(74,124,111,0.55)',
      targetColor: 'rgba(74,124,111,0.55)',
      weight,
      lodHidden: false,
      properties: { lodSynthetic: true, sharedNeighbors: weight },
    }
    if (graph.hasEdge(edgeId)) {
      graph.replaceEdgeAttributes(edgeId, edgeAttrs)
    } else if (
      !graph.hasEdge(source, target) &&
      !graph.hasEdge(target, source)
    ) {
      graph.addEdgeWithKey(edgeId, source, target, edgeAttrs)
    }
  }
}

/**
 * Apply overview clustering onto the live graph.
 * Multi-member docs are hidden; synthetic cluster nodes shown.
 */
export function applyOverviewClusters(
  graph: NeoSigmaGraph,
  options?: { rebuild?: boolean; mode?: OverviewClusterMode }
): OverviewCluster[] {
  const rebuild = options?.rebuild !== false
  const mode = options?.mode ?? 'spatial'

  // Always clear previous member hiding for documents before re-apply
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'document') {
      graph.setNodeAttribute(id, 'lodHidden', false)
    }
  })

  const clusters = rebuild
    ? mode === 'membership'
      ? computeMembershipClusters(graph)
      : computeOverviewClusters(graph)
    : readExistingClusters(graph)

  const activeIds = new Set(clusters.map((c) => c.id))
  const stale: string[] = []
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' && !activeIds.has(id)) stale.push(id)
  })
  for (const id of stale) {
    if (graph.hasNode(id)) graph.dropNode(id)
  }

  const docToCluster = memberToCluster(clusters)
  for (const cluster of clusters) {
    ensureClusterNode(graph, cluster)
    for (const memberId of cluster.memberIds) {
      if (graph.hasNode(memberId)) {
        graph.setNodeAttribute(memberId, 'lodHidden', true)
      }
    }
  }

  // Hide leftover cluster nodes not in this set
  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'cluster') return
    graph.setNodeAttribute(id, 'lodHidden', !activeIds.has(id))
  })

  applyBridgesAndPubs(graph, clusters, docToCluster)
  return clusters
}

function readExistingClusters(graph: NeoSigmaGraph): OverviewCluster[] {
  const out: OverviewCluster[] = []
  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'cluster') return
    if (!Array.isArray(attrs.memberIds) || attrs.memberIds.length < 2) return
    out.push({
      id,
      memberIds: attrs.memberIds,
      x: attrs.x,
      y: attrs.y,
      storyCount: attrs.memberIds.length,
      leafCountSum:
        typeof attrs.leafCount === 'number' ? attrs.leafCount : 0,
      label: attrs.fullLabel || attrs.label || `${attrs.memberIds.length} stories`,
    })
  })
  if (out.length > 0) return out
  return computeOverviewClusters(graph)
}

/** Hide synthetic clusters/edges and restore document visibility flags. */
export function clearOverviewClusters(graph: NeoSigmaGraph): void {
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster') {
      graph.setNodeAttribute(id, 'lodHidden', true)
    }
    if (attrs.kind === 'document' || attrs.kind === 'publication') {
      // leave leaf handling to applyNeoLod; clear overview-specific hides
      if (attrs.kind === 'document') {
        graph.setNodeAttribute(id, 'lodHidden', false)
      }
      if (attrs.kind === 'publication') {
        graph.setNodeAttribute(id, 'lodHidden', false)
      }
    }
  })
  graph.forEachEdge((edge, attrs) => {
    if (attrs.properties?.lodSynthetic === true) {
      graph.setEdgeAttribute(edge, 'lodHidden', true)
    }
  })
}

export function findClusterIdForDocument(
  graph: NeoSigmaGraph,
  documentId: string
): string | null {
  let found: string | null = null
  graph.forEachNode((id, attrs) => {
    if (found) return
    if (attrs.kind !== 'cluster') return
    if (attrs.lodHidden) return
    if (Array.isArray(attrs.memberIds) && attrs.memberIds.includes(documentId)) {
      found = id
    }
  })
  if (found) return found
  // Also search hidden clusters (for force-visible while mid)
  graph.forEachNode((id, attrs) => {
    if (found) return
    if (attrs.kind !== 'cluster') return
    if (Array.isArray(attrs.memberIds) && attrs.memberIds.includes(documentId)) {
      found = id
    }
  })
  return found
}

export function getClusterMemberLabels(
  graph: NeoSigmaGraph,
  clusterId: string
): Array<{ id: string; label: string }> {
  if (!graph.hasNode(clusterId)) return []
  const members = graph.getNodeAttribute(clusterId, 'memberIds')
  if (!Array.isArray(members)) return []
  return members.map((id) => {
    if (!graph.hasNode(id)) return { id, label: id }
    const attrs = graph.getNodeAttributes(id)
    const label =
      typeof attrs.fullLabel === 'string' && attrs.fullLabel
        ? attrs.fullLabel
        : attrs.label
    return { id, label }
  })
}

export function clusterMemberBounds(
  graph: NeoSigmaGraph,
  clusterId: string
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (!graph.hasNode(clusterId)) return null
  const members = graph.getNodeAttribute(clusterId, 'memberIds')
  if (!Array.isArray(members) || members.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let n = 0
  for (const id of members) {
    if (!graph.hasNode(id)) continue
    const { x, y } = graph.getNodeAttributes(id)
    n += 1
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (n === 0) return null
  return { minX, maxX, minY, maxY }
}
