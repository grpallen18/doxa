import { Position, type Edge, type InternalNode, type Node } from '@xyflow/react'
import {
  type WorkflowCanvasEdgeAttachments,
  positionFromSide,
} from '@/lib/admin/workflow-canvas/edge-attachments'
import type { EdgeEndpointOverride } from '@/lib/admin/workflow-canvas/edge-attachments'
import {
  getFloatingEdgeParams,
  getPointOnSide,
  getPointOnSideFromFraction,
  getPreferredSides,
} from '@/lib/admin/workflow-canvas/floating-edge-utils'

export type FloatingEdgeLayout = {
  sx: number
  sy: number
  tx: number
  ty: number
  sourcePos: Position
  targetPos: Position
}

type EndpointRef = {
  edgeId: string
  role: 'source' | 'target'
  nodeId: string
  side: Position
  peerNodeId: string
}

function bucketKey(nodeId: string, side: Position): string {
  return `${nodeId}:${side}`
}

function buildLayoutCacheKey(
  edges: Edge[],
  edgeAttachments: WorkflowCanvasEdgeAttachments,
  getNode: (id: string) => InternalNode<Node> | undefined
): string {
  const parts: string[] = []
  for (const edge of edges) {
    const source = getNode(edge.source)
    const target = getNode(edge.target)
    if (!source || !target) continue
    const sp = source.internals.positionAbsolute
    const tp = target.internals.positionAbsolute
    const attach = edgeAttachments[edge.id]
    parts.push(
      `${edge.id}:${sp.x},${sp.y}:${tp.x},${tp.y}:${source.measured?.width ?? ''},${source.measured?.height ?? ''}:${target.measured?.width ?? ''},${target.measured?.height ?? ''}:${attach?.source?.side ?? ''}:${attach?.source?.fraction ?? ''}:${attach?.target?.side ?? ''}:${attach?.target?.fraction ?? ''}`
    )
  }
  return parts.join('|')
}

function resolveEndpointPoint(
  node: InternalNode<Node>,
  side: Position,
  override: EdgeEndpointOverride | undefined,
  slotIndex: number,
  slotCount: number
): { x: number; y: number } {
  if (override?.fraction !== undefined) {
    return getPointOnSideFromFraction(node, side, override.fraction)
  }
  return getPointOnSide(node, side, slotIndex, slotCount)
}

function resolveSides(
  edge: Edge,
  sourceNode: InternalNode<Node>,
  targetNode: InternalNode<Node>,
  edgeAttachments: WorkflowCanvasEdgeAttachments
): { sourceSide: Position; targetSide: Position } {
  const override = edgeAttachments[edge.id]
  const preferred = getPreferredSides(sourceNode, targetNode)
  return {
    sourceSide: override?.source?.side
      ? positionFromSide(override.source.side)
      : preferred.sourcePos,
    targetSide: override?.target?.side
      ? positionFromSide(override.target.side)
      : preferred.targetPos,
  }
}

function computeFloatingEdgeLayout(
  edges: Edge[],
  edgeAttachments: WorkflowCanvasEdgeAttachments,
  getNode: (id: string) => InternalNode<Node> | undefined
): Map<string, FloatingEdgeLayout> {
  const pass1 = new Map<string, { sourceSide: Position; targetSide: Position }>()
  const endpoints: EndpointRef[] = []

  for (const edge of edges) {
    const sourceNode = getNode(edge.source)
    const targetNode = getNode(edge.target)
    if (!sourceNode || !targetNode) continue

    const sides = resolveSides(edge, sourceNode, targetNode, edgeAttachments)
    pass1.set(edge.id, sides)

    endpoints.push({
      edgeId: edge.id,
      role: 'source',
      nodeId: edge.source,
      side: sides.sourceSide,
      peerNodeId: edge.target,
    })
    endpoints.push({
      edgeId: edge.id,
      role: 'target',
      nodeId: edge.target,
      side: sides.targetSide,
      peerNodeId: edge.source,
    })
  }

  const buckets = new Map<string, EndpointRef[]>()
  for (const endpoint of endpoints) {
    const key = bucketKey(endpoint.nodeId, endpoint.side)
    const list = buckets.get(key) ?? []
    list.push(endpoint)
    buckets.set(key, list)
  }

  const slotByEndpoint = new Map<string, { index: number; count: number }>()
  for (const group of buckets.values()) {
    group.sort((a, b) => {
      const peer = a.peerNodeId.localeCompare(b.peerNodeId)
      if (peer !== 0) return peer
      return a.role.localeCompare(b.role)
    })
    group.forEach((endpoint, index) => {
      slotByEndpoint.set(`${endpoint.edgeId}:${endpoint.role}`, {
        index,
        count: group.length,
      })
    })
  }

  const layouts = new Map<string, FloatingEdgeLayout>()

  for (const edge of edges) {
    const sourceNode = getNode(edge.source)
    const targetNode = getNode(edge.target)
    const sides = pass1.get(edge.id)
    if (!sourceNode || !targetNode || !sides) continue

    const sourceSlot = slotByEndpoint.get(`${edge.id}:source`)
    const targetSlot = slotByEndpoint.get(`${edge.id}:target`)
    if (!sourceSlot || !targetSlot) continue

    const override = edgeAttachments[edge.id]
    const sourcePoint = resolveEndpointPoint(
      sourceNode,
      sides.sourceSide,
      override?.source,
      sourceSlot.index,
      sourceSlot.count
    )
    const targetPoint = resolveEndpointPoint(
      targetNode,
      sides.targetSide,
      override?.target,
      targetSlot.index,
      targetSlot.count
    )

    layouts.set(edge.id, {
      sx: sourcePoint.x,
      sy: sourcePoint.y,
      tx: targetPoint.x,
      ty: targetPoint.y,
      sourcePos: sides.sourceSide,
      targetPos: sides.targetSide,
    })
  }

  return layouts
}

let layoutCache: {
  key: string
  layouts: Map<string, FloatingEdgeLayout>
} | null = null

export function getDistributedFloatingEdgeLayout(
  edges: Edge[],
  edgeAttachments: WorkflowCanvasEdgeAttachments,
  getNode: (id: string) => InternalNode<Node> | undefined
): Map<string, FloatingEdgeLayout> {
  const key = buildLayoutCacheKey(edges, edgeAttachments, getNode)
  if (layoutCache?.key === key) return layoutCache.layouts
  const layouts = computeFloatingEdgeLayout(edges, edgeAttachments, getNode)
  layoutCache = { key, layouts }
  return layouts
}

export function buildFloatingLayoutVersion(
  edges: Edge[],
  edgeAttachments: WorkflowCanvasEdgeAttachments,
  nodeLookup: Map<string, InternalNode<Node>>
): string {
  return buildLayoutCacheKey(edges, edgeAttachments, (id) => nodeLookup.get(id))
}

export function clearFloatingEdgeLayoutCache(): void {
  layoutCache = null
}
