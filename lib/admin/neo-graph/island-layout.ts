import {
  COMMUNITY_UNLINKED,
} from '@/lib/admin/neo-graph/community-ids'
import {
  edgeLayoutWeight,
  hashSeed,
} from '@/lib/admin/neo-graph/layout-pipeline'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'

/** Tight organic disk — FA2 settles this into one irregular mass. */
export const NEBULA_SEED_SCALE = 160

function communityOf(graph: NeoSigmaGraph, id: string): string {
  const raw = graph.getNodeAttribute(id, 'communityId')
  return typeof raw === 'string' && raw ? raw : COMMUNITY_UNLINKED
}

function nebulaJitter(id: string): { x: number; y: number } {
  const sx = hashSeed(id)
  const sy = hashSeed(`${id}:y`)
  return {
    x: ((sx % 1000) / 1000 - 0.5) * NEBULA_SEED_SCALE,
    y: ((sy % 1000) / 1000 - 0.5) * NEBULA_SEED_SCALE,
  }
}

/**
 * Scatter into one disk. No community ring, kind-rings, or pinned hubs.
 */
export function seedOntologyIslandPositions(graph: NeoSigmaGraph): void {
  graph.forEachNode((id, attrs) => {
    if (attrs.kind === 'cluster' || attrs.properties?.lodSynthetic) return
    const p = nebulaJitter(id)
    graph.setNodeAttribute(id, 'x', p.x)
    graph.setNodeAttribute(id, 'y', p.y)
    graph.setNodeAttribute(id, 'fixed', false)
  })
}

export function isInterstitialPair(
  sourceCommunity: string,
  targetCommunity: string
): boolean {
  if (!sourceCommunity || !targetCommunity) return false
  return sourceCommunity !== targetCommunity
}

export function placeNodesInIslands(
  graph: NeoSigmaGraph,
  nodeIds: ReadonlySet<string> | string[]
): void {
  const ids = [...nodeIds].filter((id) => graph.hasNode(id))
  if (ids.length === 0) return
  for (const id of ids) {
    const p = nebulaJitter(id)
    graph.setNodeAttribute(id, 'x', p.x)
    graph.setNodeAttribute(id, 'y', p.y)
    graph.setNodeAttribute(id, 'fixed', false)
  }
}

/** Mild community bias so color mottles inside one mass — not enough to split islands. */
export function assignIslandEdgeWeights(graph: NeoSigmaGraph): void {
  graph.forEachEdge((edge, attrs, source, target) => {
    const base = edgeLayoutWeight(attrs.edgeType)
    const inter = isInterstitialPair(
      communityOf(graph, source),
      communityOf(graph, target)
    )
    const weight = inter ? base * 0.55 : base * 1.15
    graph.setEdgeAttribute(edge, 'weight', weight)
  })
}
