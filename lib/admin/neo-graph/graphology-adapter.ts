import Graph from 'graphology'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoGraphFilters,
} from '@/lib/admin/neo-graph/types'
import {
  NEO_EDGE_IDLE_ALPHA,
  NEO_EDGE_SIZE_IDLE,
  resolveNodeAppearance,
} from '@/lib/admin/neo-graph/appearance'
import { withPremultipliedAlpha } from '@/lib/admin/neo-graph/colors'
import {
  edgeLayoutWeight,
  hashSeed,
  placeNodesHierarchically,
} from '@/lib/admin/neo-graph/layout-pipeline'

export type SigmaNodeAttributes = {
  label: string
  fullLabel: string
  kind: DoxaGraphNode['kind']
  size: number
  /** Pre-LOD size so mid boost can restore cleanly. */
  baseSize?: number
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
  /** Soft halo radius in graph units (mid zoom envelopes). */
  envelopeRadius?: number
  /** Overview cluster membership (synthetic cluster nodes). */
  memberIds?: string[]
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
  /** Premultiplied color at the source end (node-colored gradient). */
  color: string
  /** Premultiplied color at the target end. */
  targetColor: string
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
  assessment: 8,
  evidence_check: 9,
  argument: 10,
  citation: 11,
  method_run: 12,
  utterance: 13,
  segment: 14,
  cluster: 99,
}

function prioritizeNodesForCap(nodes: DoxaGraphNode[]): DoxaGraphNode[] {
  return [...nodes].sort((a, b) => {
    const pa = KIND_KEEP_PRIORITY[a.kind] ?? 99
    const pb = KIND_KEEP_PRIORITY[b.kind] ?? 99
    if (pa !== pb) return pa - pb
    return (b.degreeHint ?? 0) - (a.degreeHint ?? 0)
  })
}

/** Id-stable organic scatter so ForceAtlas2 starts from a natural field. */
function initialPosition(id: string, _kind: DoxaGraphNode['kind']): NeoNodePosition {
  const sx = hashSeed(id)
  const sy = hashSeed(`${id}:y`)
  const scale = 480
  return {
    x: ((sx % 1000) / 1000 - 0.5) * scale,
    y: ((sy % 1000) / 1000 - 0.5) * scale,
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
    }
    graph.addNode(node.id, {
      label: node.label,
      fullLabel: node.label,
      kind: node.kind,
      size: appearance.size,
      baseSize: appearance.size,
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
    const sourceColor =
      (graph.getNodeAttribute(source, 'color') as string) || '#888888'
    const targetColor =
      (graph.getNodeAttribute(target, 'color') as string) || '#888888'
    graph.addEdgeWithKey(edgeId, source, target, {
      label: edge.label,
      type: 'curvedArrow',
      edgeType: edge.type,
      size: NEO_EDGE_SIZE_IDLE,
      color: withPremultipliedAlpha(sourceColor, NEO_EDGE_IDLE_ALPHA),
      targetColor: withPremultipliedAlpha(targetColor, NEO_EDGE_IDLE_ALPHA),
      weight: edgeLayoutWeight(edge.type),
      properties: edge.properties,
    })
  }

  // Place newly visible nodes with the publication-first hierarchy.
  if (newNodeIds.length > 0) {
    placeNodesHierarchically(graph, newNodeIds)
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
    if (attrs.kind === 'cluster') return
    if (attrs.properties?.lodSynthetic === true) return
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
