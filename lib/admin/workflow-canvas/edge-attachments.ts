import { Position } from '@xyflow/react'

export const EDGE_ATTACHMENTS_KEY = '__edge_attachments__'

export type EdgeEndpointSide = 'top' | 'right' | 'bottom' | 'left'

export type EdgeEndpointOverride = {
  side: EdgeEndpointSide
  fraction?: number
}

export type WorkflowCanvasEdgeAttachment = {
  source?: EdgeEndpointOverride
  target?: EdgeEndpointOverride
}

export type WorkflowCanvasEdgeAttachments = Record<string, WorkflowCanvasEdgeAttachment>

const SIDE_VALUES: EdgeEndpointSide[] = ['top', 'right', 'bottom', 'left']

export function isEdgeEndpointSide(value: unknown): value is EdgeEndpointSide {
  return typeof value === 'string' && SIDE_VALUES.includes(value as EdgeEndpointSide)
}

export function positionFromSide(side: EdgeEndpointSide): Position {
  switch (side) {
    case 'top':
      return Position.Top
    case 'right':
      return Position.Right
    case 'bottom':
      return Position.Bottom
    case 'left':
      return Position.Left
  }
}

export function sideFromPosition(position: Position): EdgeEndpointSide {
  switch (position) {
    case Position.Top:
      return 'top'
    case Position.Right:
      return 'right'
    case Position.Bottom:
      return 'bottom'
    case Position.Left:
      return 'left'
    default:
      return 'right'
  }
}

export function parseWorkflowCanvasEdgeAttachments(
  raw: unknown
): WorkflowCanvasEdgeAttachments {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WorkflowCanvasEdgeAttachments = {}
  for (const [edgeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!edgeId || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const parseEndpoint = (rawEndpoint: unknown): EdgeEndpointOverride | undefined => {
      if (!rawEndpoint || typeof rawEndpoint !== 'object' || Array.isArray(rawEndpoint)) {
        return undefined
      }
      const value = rawEndpoint as Record<string, unknown>
      if (!isEdgeEndpointSide(value.side)) return undefined
      const fraction =
        typeof value.fraction === 'number' && Number.isFinite(value.fraction)
          ? Math.min(0.95, Math.max(0.05, value.fraction))
          : undefined
      return { side: value.side, ...(fraction !== undefined ? { fraction } : {}) }
    }
    const source = parseEndpoint(entry.source)
    const target = parseEndpoint(entry.target)
    if (source || target) out[edgeId] = { source, target }
  }
  return out
}

export function mergeWorkflowCanvasEdgeAttachments(
  existing: WorkflowCanvasEdgeAttachments,
  incoming: WorkflowCanvasEdgeAttachments
): WorkflowCanvasEdgeAttachments {
  return { ...existing, ...incoming }
}
