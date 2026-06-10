import type { Node } from '@xyflow/react'
import type { WorkflowCanvasPositions } from '@/lib/admin/workflow-canvas/layout'

export function applySavedPositionsToNodes(
  nodes: Node[],
  savedPositions: WorkflowCanvasPositions
): Node[] {
  if (Object.keys(savedPositions).length === 0) return nodes
  return nodes.map((node) => {
    const saved = savedPositions[node.id]
    if (!saved) return node
    return { ...node, position: { x: saved.x, y: saved.y } }
  })
}

/** Keep dragged positions when pipeline status refreshes rebuild node data. */
export function mergeGraphIntoNodes(current: Node[], incoming: Node[]): Node[] {
  const positionById = new Map(current.map((n) => [n.id, n.position]))
  const selectedById = new Map(current.map((n) => [n.id, n.selected]))
  return incoming.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position,
    selected: selectedById.get(node.id) ?? false,
  }))
}

export function nodesToPositions(nodes: Node[]): WorkflowCanvasPositions {
  const positions: WorkflowCanvasPositions = {}
  for (const node of nodes) {
    positions[node.id] = { x: node.position.x, y: node.position.y }
  }
  return positions
}
