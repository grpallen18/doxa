import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'

export function collectNeighborhood(
  graph: NeoSigmaGraph,
  nodeId: string
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId])
  const edges = new Set<string>()
  if (!graph.hasNode(nodeId)) return { nodes, edges }

  graph.forEachEdge(nodeId, (edge, _attrs, source, target) => {
    edges.add(edge)
    nodes.add(source)
    nodes.add(target)
  })
  return { nodes, edges }
}
