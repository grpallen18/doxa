import {
  ORBIT_BASE_GAP,
  ORBIT_SPREAD,
  computeDocumentLeafCounts,
  hashSeed,
  isLeafKind,
} from '@/lib/admin/neo-graph/layout-pipeline'
import {
  applyOverviewClusters,
  clearOverviewClusters,
  findClusterIdForDocument,
  type OverviewCluster,
} from '@/lib/admin/neo-graph/overview-clusters'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'

/**
 * Sigma camera: larger ratio = more zoomed out.
 * Mid: hide leaves + document envelopes.
 * Overview: spatial document clusters.
 */
export const NEO_LOD_FAR_RATIO = 1.35
export const NEO_LOD_OVERVIEW_RATIO = 2.4

/** Mid-zoom document disc size multiplier (clamped later in reducer). */
export const NEO_LOD_MID_SIZE_BOOST = 1.35
export const NEO_LOD_MID_SIZE_MAX = 28

export type NeoLodLevel = 'near' | 'mid' | 'overview'

export function lodLevelFromRatio(ratio: number): NeoLodLevel {
  if (ratio >= NEO_LOD_OVERVIEW_RATIO) return 'overview'
  if (ratio >= NEO_LOD_FAR_RATIO) return 'mid'
  return 'near'
}

export function lodLevelLabel(level: NeoLodLevel): string {
  if (level === 'overview') return 'LOD: overview'
  if (level === 'mid') return 'LOD: mid'
  return 'LOD: near'
}

export type ApplyNeoLodOptions = {
  level: NeoLodLevel
  /** Leaf / document / cluster ids that must stay visible while collapsed. */
  forceVisibleIds?: ReadonlySet<string> | null
  /** Rebuild overview cluster membership (layout settle or enter overview). */
  rebuildClusters?: boolean
}

export function documentEnvelopeRadius(
  parentSize: number,
  leafCount: number
): number {
  const n = Math.max(0, leafCount)
  const leafSize = 10
  return parentSize + leafSize + ORBIT_BASE_GAP + ORBIT_SPREAD * Math.sqrt(n)
}

function restoreBaseLabel(graph: NeoSigmaGraph, id: string): string {
  const attrs = graph.getNodeAttributes(id)
  return typeof attrs.fullLabel === 'string' && attrs.fullLabel
    ? attrs.fullLabel
    : typeof attrs.label === 'string'
      ? attrs.label
      : ''
}

function applyDocumentEnvelopeAttrs(
  graph: NeoSigmaGraph,
  id: string,
  midOrOverview: boolean
): void {
  const attrs = graph.getNodeAttributes(id)
  const baseLabel = restoreBaseLabel(graph, id)
  const leafCount =
    typeof attrs.leafCount === 'number' && Number.isFinite(attrs.leafCount)
      ? attrs.leafCount
      : 0
  const baseSize =
    typeof attrs.baseSize === 'number' && Number.isFinite(attrs.baseSize)
      ? attrs.baseSize
      : attrs.size

  const envelope = documentEnvelopeRadius(baseSize, leafCount)
  graph.setNodeAttribute(id, 'envelopeRadius', envelope)

  if (midOrOverview && leafCount > 0) {
    graph.setNodeAttribute(id, 'label', `${baseLabel} (${leafCount})`)
    graph.setNodeAttribute(id, 'forceLabel', true)
  } else {
    graph.setNodeAttribute(id, 'label', baseLabel)
  }

  if (midOrOverview) {
    const boosted = Math.min(
      NEO_LOD_MID_SIZE_MAX,
      baseSize * NEO_LOD_MID_SIZE_BOOST
    )
    graph.setNodeAttribute(id, 'size', boosted)
  } else {
    graph.setNodeAttribute(id, 'size', baseSize)
  }
}

/**
 * Toggle leaf / overview visibility for zoom LOD. Does not rebuild FA2.
 */
export function applyNeoLod(
  graph: NeoSigmaGraph,
  options: ApplyNeoLodOptions
): OverviewCluster[] {
  const { level, forceVisibleIds, rebuildClusters = false } = options
  const midOrOverview = level === 'mid' || level === 'overview'
  const overview = level === 'overview'

  computeDocumentLeafCounts(graph)

  let clusters: OverviewCluster[] = []
  if (overview) {
    clusters = applyOverviewClusters(graph, { rebuild: rebuildClusters })
  } else {
    clearOverviewClusters(graph)
  }

  const force = forceVisibleIds ?? null

  graph.forEachNode((id, attrs) => {
    const kind = attrs.kind as NeoNodeKind
    const forced = Boolean(force?.has(id))

    if (kind === 'cluster') {
      // Visibility owned by applyOverviewClusters / clearOverviewClusters
      if (forced) graph.setNodeAttribute(id, 'lodHidden', false)
      return
    }

    if (kind === 'document') {
      applyDocumentEnvelopeAttrs(graph, id, midOrOverview)
      if (overview) {
        if (forced) {
          graph.setNodeAttribute(id, 'lodHidden', false)
        }
        // else: keep lodHidden set by applyOverviewClusters (members hidden, solos visible)
      } else {
        graph.setNodeAttribute(id, 'lodHidden', false)
      }
      return
    }

    if (kind === 'publication') {
      if (overview) {
        // Bridging pubs kept visible by applyOverviewClusters; others hidden there.
        if (forced) graph.setNodeAttribute(id, 'lodHidden', false)
      } else {
        graph.setNodeAttribute(id, 'lodHidden', false)
      }
      return
    }

    if (!isLeafKind(kind)) {
      graph.setNodeAttribute(id, 'lodHidden', overview && !forced)
      return
    }

    // Leaves
    const hide = midOrOverview && !forced
    graph.setNodeAttribute(id, 'lodHidden', hide)
  })

  // Re-apply forced documents: unhide + ensure their cluster is visible
  if (force && overview) {
    for (const id of force) {
      if (!graph.hasNode(id)) continue
      const kind = graph.getNodeAttribute(id, 'kind') as NeoNodeKind
      if (kind === 'document') {
        graph.setNodeAttribute(id, 'lodHidden', false)
        const clusterId = findClusterIdForDocument(graph, id)
        if (clusterId && graph.hasNode(clusterId)) {
          graph.setNodeAttribute(clusterId, 'lodHidden', false)
        }
      } else if (isLeafKind(kind)) {
        graph.setNodeAttribute(id, 'lodHidden', false)
      } else if (kind === 'cluster') {
        graph.setNodeAttribute(id, 'lodHidden', false)
      }
    }
  }

  graph.forEachEdge((edge, attrs, source, target) => {
    if (attrs.properties?.lodSynthetic === true) {
      const hideEdge = !overview
      graph.setEdgeAttribute(edge, 'lodHidden', hideEdge)
      return
    }
    const sHidden = Boolean(graph.getNodeAttribute(source, 'lodHidden'))
    const tHidden = Boolean(graph.getNodeAttribute(target, 'lodHidden'))
    graph.setEdgeAttribute(edge, 'lodHidden', sHidden || tHidden)
  })

  return clusters
}

export function collectForceVisibleLeafPath(
  graph: NeoSigmaGraph,
  nodeId: string | null | undefined
): Set<string> {
  const out = new Set<string>()
  if (!nodeId || !graph.hasNode(nodeId)) return out
  const kind = graph.getNodeAttribute(nodeId, 'kind') as NeoNodeKind

  if (kind === 'cluster') {
    out.add(nodeId)
    const members = graph.getNodeAttribute(nodeId, 'memberIds')
    if (Array.isArray(members)) {
      for (const m of members) out.add(m)
    }
    return out
  }

  if (kind === 'document') {
    out.add(nodeId)
    const clusterId = findClusterIdForDocument(graph, nodeId)
    if (clusterId) out.add(clusterId)
    return out
  }

  if (!isLeafKind(kind)) return out
  out.add(nodeId)
  graph.forEachNeighbor(nodeId, (neighborId) => {
    out.add(neighborId)
    const nKind = graph.getNodeAttribute(neighborId, 'kind') as NeoNodeKind
    if (nKind === 'document') {
      const clusterId = findClusterIdForDocument(graph, neighborId)
      if (clusterId) out.add(clusterId)
    }
  })
  return out
}

/** Stable seed export for tests / envelopes — re-export hash for cluster ids. */
export { hashSeed }
