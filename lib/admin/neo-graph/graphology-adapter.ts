import Graph from 'graphology'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoGraphFilters,
} from '@/lib/admin/neo-graph/types'
import {
  resolveEdgeColor,
  resolveNodeAppearance,
} from '@/lib/admin/neo-graph/appearance'

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
  hidden?: boolean
  properties: DoxaGraphEdge['properties']
}

export type NeoSigmaGraph = Graph<SigmaNodeAttributes, SigmaEdgeAttributes>

const MAX_NODES = 400

function hashSeed(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function initialPosition(id: string, kind: DoxaGraphNode['kind'], index: number) {
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
  const angle = ((seed % 360) + index * 11) * (Math.PI / 180)
  const jitter = (seed % 30) - 15
  return {
    x: Math.cos(angle) * (ring + jitter),
    y: Math.sin(angle) * (ring + jitter),
  }
}

export type GraphologyBuildResult = {
  graph: NeoSigmaGraph
  truncated: boolean
  nodeCount: number
  edgeCount: number
  droppedNodes: number
  droppedEdges: number
}

/**
 * Primary visualization boundary: DoxaGraphProjection → Graphology.
 * Idempotent for duplicate node/edge ids; no Neo4j access.
 */
export function buildGraphologyFromProjection(
  projection: DoxaGraphProjection,
  filters?: NeoGraphFilters
): GraphologyBuildResult {
  const graph: NeoSigmaGraph = new Graph({
    multi: false,
    type: 'directed',
    allowSelfLoops: false,
  })

  const kindOk = (kind: DoxaGraphNode['kind']) =>
    !filters || filters.kinds[kind] !== false
  const edgeOk = (type: DoxaGraphEdge['type']) =>
    !filters || filters.edgeTypes[type] !== false

  let droppedNodes = 0
  const visibleNodes = projection.nodes.filter((n) => kindOk(n.kind))
  const capped = visibleNodes.slice(0, MAX_NODES)
  droppedNodes = visibleNodes.length - capped.length

  capped.forEach((node, index) => {
    if (graph.hasNode(node.id)) return
    const appearance = resolveNodeAppearance({
      kind: node.kind,
      degreeHint: node.degreeHint,
    })
    const pos = initialPosition(node.id, node.kind, index)
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
  })

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
      size: 1.2,
      color: resolveEdgeColor(edge.type),
      properties: edge.properties,
    })
  }

  return {
    graph,
    truncated: droppedNodes > 0,
    nodeCount: graph.order,
    edgeCount: graph.size,
    droppedNodes,
    droppedEdges,
  }
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
