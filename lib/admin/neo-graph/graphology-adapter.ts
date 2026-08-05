import Graph from 'graphology'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoGraphFilters,
} from '@/lib/admin/neo-graph/types'
import {
  resolveIdleEdgeColor,
  NEO_EDGE_SIZE_IDLE,
  resolveNodeAppearance,
} from '@/lib/admin/neo-graph/appearance'
import {
  edgeLayoutWeight,
  hashSeed,
  isLeafKind,
  placeLeavesInOrbits,
} from '@/lib/admin/neo-graph/layout-pipeline'

export type SigmaNodeAttributes = {
  label: string
  fullLabel: string
  kind: DoxaGraphNode['kind']
  size: number
  color: string
  borderColor: string
  labelColor: string
  x: number
  y: number
  hidden?: boolean
  /** Zoom LOD: leaf collapsed when far (filters still omit kinds entirely). */
  lodHidden?: boolean
  /** Leaf neighbors of a document — used for far-zoom density cue. */
  leafCount?: number
  forceLabel?: boolean
  zIndex?: number
  charStart?: number
  charEnd?: number
  properties: DoxaGraphNode['properties']
  aliases: string[]
}

export type SigmaEdgeAttributes = {
  label: string
  type: string
  edgeType: DoxaGraphEdge['type']
  size: number
  color: string
  weight: number
  hidden?: boolean
  lodHidden?: boolean
  properties: DoxaGraphEdge['properties']
}

export type NeoSigmaGraph = Graph<SigmaNodeAttributes, SigmaEdgeAttributes>

export type NeoNodePosition = { x: number; y: number }

/** Soft render ceiling — large enough for a ~100-story union with discourse nodes. */
const MAX_NODES = 8000

const KIND_KEEP_PRIORITY: Record<DoxaGraphNode['kind'], number> = {
  document: 0,
  publication: 1,
  entity: 2,
  agent: 3,
  controversy: 4,
  viewpoint: 5,
  proposition: 6,
  dispute: 7,
  argument: 8,
  utterance: 9,
  segment: 10,
}

function prioritizeNodesForCap(nodes: DoxaGraphNode[]): DoxaGraphNode[] {
  return [...nodes].sort((a, b) => {
    const pa = KIND_KEEP_PRIORITY[a.kind] ?? 99
    const pb = KIND_KEEP_PRIORITY[b.kind] ?? 99
    if (pa !== pb) return pa - pb
    return (b.degreeHint ?? 0) - (a.degreeHint ?? 0)
  })
}

/** Id-stable seed (no filtered-list index) so the same node keeps the same start. */
function initialPosition(id: string, kind: DoxaGraphNode['kind']): NeoNodePosition {
  const seed = hashSeed(id)
  const ring =
    kind === 'controversy'
      ? 0
      : kind === 'document'
        ? 30
        : kind === 'viewpoint'
          ? 70
          : kind === 'publication'
            ? 50
            : kind === 'proposition' || kind === 'dispute'
              ? 110
              : kind === 'argument'
                ? 130
                : kind === 'agent'
                  ? 150
                  : kind === 'entity'
                    ? 165
                    : kind === 'utterance'
                      ? 220
                      : 180
  const angle = (seed % 360) * (Math.PI / 180)
  const jitter = (seed % 30) - 15
  return {
    x: Math.cos(angle) * (ring + jitter),
    y: Math.sin(angle) * (ring + jitter),
  }
}

export type GraphologyBuildOptions = {
  /** Prior layout positions keyed by node id (filter toggles / color refresh). */
  positions?: ReadonlyMap<string, NeoNodePosition>
}

export type GraphologyBuildResult = {
  graph: NeoSigmaGraph
  truncated: boolean
  nodeCount: number
  edgeCount: number
  droppedNodes: number
  droppedEdges: number
  /** Nodes that were not in `positions` and needed a fresh seed. */
  newNodeCount: number
  newNodeIds: string[]
}

/**
 * Primary visualization boundary: DoxaGraphProjection → Graphology.
 * Idempotent for duplicate node/edge ids; no Neo4j access.
 * When `positions` is provided, retained nodes keep their layout.
 */
export function buildGraphologyFromProjection(
  projection: DoxaGraphProjection,
  filters?: NeoGraphFilters,
  options?: GraphologyBuildOptions
): GraphologyBuildResult {
  const graph: NeoSigmaGraph = new Graph({
    multi: false,
    type: 'directed',
    allowSelfLoops: false,
  })
  const positions = options?.positions

  const kindOk = (kind: DoxaGraphNode['kind']) =>
    !filters || filters.kinds[kind] !== false
  const edgeOk = (type: DoxaGraphEdge['type']) =>
    !filters || filters.edgeTypes[type] !== false

  let droppedNodes = 0
  const visibleNodes = projection.nodes.filter((n) => kindOk(n.kind))
  const capped =
    visibleNodes.length <= MAX_NODES
      ? visibleNodes
      : prioritizeNodesForCap(visibleNodes).slice(0, MAX_NODES)
  droppedNodes = visibleNodes.length - capped.length

  const newNodeIds: string[] = []
  const newNodeIdSet = new Set<string>()

  for (const node of capped) {
    if (graph.hasNode(node.id)) continue
    const appearance = resolveNodeAppearance({
      kind: node.kind,
      degreeHint: node.degreeHint,
    })
    const cached = positions?.get(node.id)
    const pos = cached ?? initialPosition(node.id, node.kind)
    if (!cached) {
      newNodeIds.push(node.id)
      newNodeIdSet.add(node.id)
    }
    graph.addNode(node.id, {
      label: node.label,
      fullLabel: node.label,
      kind: node.kind,
      size: appearance.size,
      color: appearance.color,
      borderColor: appearance.borderColor,
      labelColor: appearance.labelColor,
      x: pos.x,
      y: pos.y,
      zIndex: appearance.priority,
      charStart: node.charStart,
      charEnd: node.charEnd,
      properties: node.properties,
      aliases: node.aliases,
    })
  }

  let droppedEdges = 0
  for (const edge of projection.edges) {
    if (!edgeOk(edge.type)) {
      droppedEdges += 1
      continue
    }

    let source = edge.source
    let target = edge.target
    let edgeId = edge.id

    // If a GROUNDED_IN segment target is filtered out, attach to document so
    // utterances remain connected in the discourse view.
    if (
      edge.type === 'GROUNDED_IN' &&
      graph.hasNode(source) &&
      !graph.hasNode(target)
    ) {
      const sourceNode = projection.nodes.find((n) => n.id === source)
      const docUid = sourceNode?.properties?.documentUid
      const preferredDocId =
        typeof docUid === 'string' && docUid
          ? `document:${docUid}`
          : projection.nodes.find((n) => n.kind === 'document')?.id
      if (preferredDocId && graph.hasNode(preferredDocId)) {
        target = preferredDocId
        edgeId = `${source}->${target}:GROUNDED_IN`
      }
    }

    if (!graph.hasNode(source) || !graph.hasNode(target)) {
      droppedEdges += 1
      continue
    }
    if (graph.hasEdge(edgeId)) {
      droppedEdges += 1
      continue
    }
    if (graph.hasEdge(source, target)) {
      droppedEdges += 1
      continue
    }
    graph.addEdgeWithKey(edgeId, source, target, {
      label: edge.label,
      type: 'curvedArrow',
      edgeType: edge.type,
      size: NEO_EDGE_SIZE_IDLE,
      color: resolveIdleEdgeColor(edge.type),
      weight: edgeLayoutWeight(edge.type),
      properties: edge.properties,
    })
  }

  // Orbit new leaves around settled parents; non-leaves keep kind-ring / avg seed.
  const newLeafIds = newNodeIds.filter((id) => {
    if (!graph.hasNode(id)) return false
    return isLeafKind(graph.getNodeAttribute(id, 'kind'))
  })
  if (newLeafIds.length > 0) {
    placeLeavesInOrbits(graph, { onlyNodeIds: new Set(newLeafIds) })
  }

  for (const id of newNodeIds) {
    if (!graph.hasNode(id)) continue
    if (isLeafKind(graph.getNodeAttribute(id, 'kind'))) continue
    let sx = 0
    let sy = 0
    let count = 0
    graph.forEachNeighbor(id, (neighborId) => {
      if (newNodeIdSet.has(neighborId)) return
      const n = graph.getNodeAttributes(neighborId)
      sx += n.x
      sy += n.y
      count += 1
    })
    if (count === 0) continue
    const seed = hashSeed(id)
    const jitter = ((seed % 21) - 10) * 0.35
    graph.setNodeAttribute(id, 'x', sx / count + jitter)
    graph.setNodeAttribute(id, 'y', sy / count - jitter)
  }

  return {
    graph,
    truncated: droppedNodes > 0,
    nodeCount: graph.order,
    edgeCount: graph.size,
    droppedNodes,
    droppedEdges,
    newNodeCount: newNodeIds.length,
    newNodeIds,
  }
}

export function snapshotGraphPositions(
  graph: NeoSigmaGraph
): Map<string, NeoNodePosition> {
  const next = new Map<string, NeoNodePosition>()
  graph.forEachNode((id, attrs) => {
    next.set(id, { x: attrs.x, y: attrs.y })
  })
  return next
}

export function searchProjectionNodes(
  projection: DoxaGraphProjection,
  query: string,
  limit = 20
): DoxaGraphNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ node: DoxaGraphNode; score: number }> = []
  for (const node of projection.nodes) {
    const hay = [node.label, ...node.aliases].join(' ').toLowerCase()
    if (!hay.includes(q)) continue
    const score = node.label.toLowerCase().startsWith(q) ? 2 : 1
    scored.push({ node, score: score + node.degreeHint * 0.01 })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.node)
}

export { MAX_NODES as NEO_GRAPH_MAX_NODES }
