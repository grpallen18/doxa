import { MarkerType, type Edge } from '@xyflow/react'
import {
  EDGE_COLOR_STYLES,
  resolveEdgeColor,
  resolveEdgeLabel,
  type WorkflowCanvasEdgeMetaMap,
} from '@/lib/admin/workflow-canvas/edge-meta'

export type WorkflowCanvasEdgeData = {
  defaultLabel?: string
  defaultColor?: string
  label?: string
  color?: string
}

export function applyEdgeMetaToEdges(
  edges: Edge[],
  edgeMeta: WorkflowCanvasEdgeMetaMap
): Edge[] {
  return edges.map((edge) => {
    const data = (edge.data ?? {}) as WorkflowCanvasEdgeData
    const defaultLabel = data.defaultLabel
    const label = resolveEdgeLabel(edge.id, defaultLabel, edgeMeta)
    const color = resolveEdgeColor(edge.id, edgeMeta)
    const styles = EDGE_COLOR_STYLES[color]
    return {
      ...edge,
      markerEnd: { type: MarkerType.ArrowClosed, color: styles.marker },
      style: { stroke: styles.stroke, strokeWidth: 2 },
      data: {
        ...data,
        label,
        color,
      },
    }
  })
}
