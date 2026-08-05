import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'
import {
  isLeafKind,
  computeDocumentLeafCounts,
} from '@/lib/admin/neo-graph/layout-pipeline'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'

/**
 * Sigma camera: larger ratio = more zoomed out.
 * At/above this threshold, leaf kinds are hidden (backbone-only view).
 */
export const NEO_LOD_FAR_RATIO = 1.35

export type NeoLodLevel = 'near' | 'far'

export function lodLevelFromRatio(ratio: number): NeoLodLevel {
  return ratio >= NEO_LOD_FAR_RATIO ? 'far' : 'near'
}

export type ApplyNeoLodOptions = {
  level: NeoLodLevel
  /** Leaf (and path) node ids that must stay visible while far. */
  forceVisibleIds?: ReadonlySet<string> | null
}

/**
 * Toggle leaf visibility for zoom LOD. Does not rebuild the graph or run FA2.
 * Document labels get a `(n)` density cue when far.
 */
export function applyNeoLod(
  graph: NeoSigmaGraph,
  options: ApplyNeoLodOptions
): void {
  const { level, forceVisibleIds } = options
  const far = level === 'far'
  computeDocumentLeafCounts(graph)

  graph.forEachNode((id, attrs) => {
    const kind = attrs.kind as NeoNodeKind
    const baseLabel =
      typeof attrs.fullLabel === 'string' && attrs.fullLabel
        ? attrs.fullLabel
        : typeof attrs.label === 'string'
          ? attrs.label
          : ''

    if (kind === 'document') {
      const leafCount =
        typeof attrs.leafCount === 'number' && Number.isFinite(attrs.leafCount)
          ? attrs.leafCount
          : 0
      if (far && leafCount > 0) {
        graph.setNodeAttribute(id, 'label', `${baseLabel} (${leafCount})`)
        graph.setNodeAttribute(id, 'forceLabel', true)
      } else {
        graph.setNodeAttribute(id, 'label', baseLabel)
      }
      graph.setNodeAttribute(id, 'lodHidden', false)
      return
    }

    if (!isLeafKind(kind)) {
      graph.setNodeAttribute(id, 'lodHidden', false)
      return
    }

    const forced = Boolean(forceVisibleIds?.has(id))
    const hide = far && !forced
    graph.setNodeAttribute(id, 'lodHidden', hide)
  })

  graph.forEachEdge((edge, _attrs, source, target) => {
    const sHidden = Boolean(graph.getNodeAttribute(source, 'lodHidden'))
    const tHidden = Boolean(graph.getNodeAttribute(target, 'lodHidden'))
    graph.setEdgeAttribute(edge, 'lodHidden', sHidden || tHidden)
  })
}

export function collectForceVisibleLeafPath(
  graph: NeoSigmaGraph,
  nodeId: string | null | undefined
): Set<string> {
  const out = new Set<string>()
  if (!nodeId || !graph.hasNode(nodeId)) return out
  const kind = graph.getNodeAttribute(nodeId, 'kind') as NeoNodeKind
  if (!isLeafKind(kind)) return out
  out.add(nodeId)
  graph.forEachNeighbor(nodeId, (neighborId) => {
    out.add(neighborId)
  })
  return out
}
