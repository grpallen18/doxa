import { Position, type InternalNode, type Node } from '@xyflow/react'

const NODE_SIZE_DEFAULTS: Record<string, { width: number; height: number }> = {
  agent: { width: 256, height: 140 },
  decision: { width: 224, height: 106 },
  merge: { width: 224, height: 106 },
  fanout: { width: 160, height: 48 },
  placeholder: { width: 224, height: 106 },
  terminal: { width: 224, height: 106 },
}

export const SIDE_INSET = 8

export function nodeSize(node: InternalNode<Node>): { width: number; height: number } {
  const measured = node.measured
  if (measured?.width && measured?.height) {
    return { width: measured.width, height: measured.height }
  }
  const type = node.type ?? 'agent'
  return NODE_SIZE_DEFAULTS[type] ?? NODE_SIZE_DEFAULTS.agent
}

export function nodeCenter(node: InternalNode<Node>): { x: number; y: number } {
  const { width, height } = nodeSize(node)
  return {
    x: node.internals.positionAbsolute.x + width / 2,
    y: node.internals.positionAbsolute.y + height / 2,
  }
}

/** Pick sides from relative node centers (better for left-to-right pipeline layouts). */
export function getPreferredSides(
  sourceNode: InternalNode<Node>,
  targetNode: InternalNode<Node>
): { sourcePos: Position; targetPos: Position } {
  const sourceCenter = nodeCenter(sourceNode)
  const targetCenter = nodeCenter(targetNode)
  const dx = targetCenter.x - sourceCenter.x
  const dy = targetCenter.y - sourceCenter.y
  const { width: sw, height: sh } = nodeSize(sourceNode)
  const { width: tw, height: th } = nodeSize(targetNode)

  if (Math.abs(dx) * (sh + th) >= Math.abs(dy) * (sw + tw)) {
    if (dx >= 0) {
      return { sourcePos: Position.Right, targetPos: Position.Left }
    }
    return { sourcePos: Position.Left, targetPos: Position.Right }
  }

  if (dy >= 0) {
    return { sourcePos: Position.Bottom, targetPos: Position.Top }
  }
  return { sourcePos: Position.Top, targetPos: Position.Bottom }
}

export function getNearestSide(
  node: InternalNode<Node>,
  point: { x: number; y: number }
): Position {
  const { width, height } = nodeSize(node)
  const { x: absX, y: absY } = node.internals.positionAbsolute
  const centerX = absX + width / 2
  const centerY = absY + height / 2
  const dx = point.x - centerX
  const dy = point.y - centerY

  if (Math.abs(dx) * height >= Math.abs(dy) * width) {
    return dx > 0 ? Position.Right : Position.Left
  }
  return dy > 0 ? Position.Bottom : Position.Top
}

function clampFraction(fraction: number): number {
  return Math.min(0.95, Math.max(0.05, fraction))
}

export function getPointOnSideFromFraction(
  node: InternalNode<Node>,
  side: Position,
  fraction: number
): { x: number; y: number } {
  const f = clampFraction(fraction)
  const { width, height } = nodeSize(node)
  const { x: absX, y: absY } = node.internals.positionAbsolute
  const innerTop = absY + SIDE_INSET
  const innerLeft = absX + SIDE_INSET
  const innerHeight = Math.max(height - 2 * SIDE_INSET, 1)
  const innerWidth = Math.max(width - 2 * SIDE_INSET, 1)

  switch (side) {
    case Position.Left:
      return { x: absX, y: innerTop + innerHeight * f }
    case Position.Right:
      return { x: absX + width, y: innerTop + innerHeight * f }
    case Position.Top:
      return { x: innerLeft + innerWidth * f, y: absY }
    case Position.Bottom:
      return { x: innerLeft + innerWidth * f, y: absY + height }
    default:
      return nodeCenter(node)
  }
}

export function projectFlowPointToSide(
  node: InternalNode<Node>,
  side: Position,
  point: { x: number; y: number }
): { x: number; y: number; fraction: number } {
  const { width, height } = nodeSize(node)
  const { x: absX, y: absY } = node.internals.positionAbsolute
  const innerTop = absY + SIDE_INSET
  const innerLeft = absX + SIDE_INSET
  const innerHeight = Math.max(height - 2 * SIDE_INSET, 1)
  const innerWidth = Math.max(width - 2 * SIDE_INSET, 1)

  switch (side) {
    case Position.Left:
    case Position.Right: {
      const fraction = clampFraction((point.y - innerTop) / innerHeight)
      return {
        x: side === Position.Left ? absX : absX + width,
        y: innerTop + innerHeight * fraction,
        fraction,
      }
    }
    case Position.Top:
    case Position.Bottom: {
      const fraction = clampFraction((point.x - innerLeft) / innerWidth)
      return {
        x: innerLeft + innerWidth * fraction,
        y: side === Position.Top ? absY : absY + height,
        fraction,
      }
    }
    default:
      return { ...nodeCenter(node), fraction: 0.5 }
  }
}

export function getPointOnSide(
  node: InternalNode<Node>,
  side: Position,
  slotIndex: number,
  slotCount: number
): { x: number; y: number } {
  const { width, height } = nodeSize(node)
  const { x: absX, y: absY } = node.internals.positionAbsolute
  const fraction = (slotIndex + 1) / (slotCount + 1)

  const innerTop = absY + SIDE_INSET
  const innerLeft = absX + SIDE_INSET
  const innerHeight = Math.max(height - 2 * SIDE_INSET, 1)
  const innerWidth = Math.max(width - 2 * SIDE_INSET, 1)

  switch (side) {
    case Position.Left:
      return { x: absX, y: innerTop + innerHeight * fraction }
    case Position.Right:
      return { x: absX + width, y: innerTop + innerHeight * fraction }
    case Position.Top:
      return { x: innerLeft + innerWidth * fraction, y: absY }
    case Position.Bottom:
      return { x: innerLeft + innerWidth * fraction, y: absY + height }
    default:
      return nodeCenter(node)
  }
}

export function getFloatingEdgeParams(
  sourceNode: InternalNode<Node>,
  targetNode: InternalNode<Node>
): {
  sx: number
  sy: number
  tx: number
  ty: number
  sourcePos: Position
  targetPos: Position
} {
  const { sourcePos, targetPos } = getPreferredSides(sourceNode, targetNode)
  const sourcePoint = getPointOnSide(sourceNode, sourcePos, 0, 1)
  const targetPoint = getPointOnSide(targetNode, targetPos, 0, 1)

  return {
    sx: sourcePoint.x,
    sy: sourcePoint.y,
    tx: targetPoint.x,
    ty: targetPoint.y,
    sourcePos,
    targetPos,
  }
}
