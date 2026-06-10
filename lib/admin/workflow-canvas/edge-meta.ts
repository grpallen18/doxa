import type { VisionEdgeSpec } from '@/lib/admin/workflow-canvas/types'

export const EDGE_META_KEY = '__edge_meta__'

export type EdgeColor = 'green' | 'yellow' | 'red'

export type WorkflowCanvasEdgeMeta = {
  label?: string
  color?: EdgeColor
}

export type WorkflowCanvasEdgeMetaMap = Record<string, WorkflowCanvasEdgeMeta>

export const EDGE_COLOR_STYLES: Record<
  EdgeColor,
  { stroke: string; marker: string; text: string }
> = {
  green: { stroke: '#10b981', marker: '#10b981', text: 'text-emerald-400' },
  yellow: { stroke: '#f59e0b', marker: '#f59e0b', text: 'text-amber-400' },
  red: { stroke: '#f43f5e', marker: '#f43f5e', text: 'text-rose-400' },
}

export const DEFAULT_EDGE_COLOR: EdgeColor = 'green'

const QUALIFY_SOURCE_NODES = new Set(['relevance-gate', 'review-pending-stories'])

const SOURCE_HANDLE_LABELS: Record<string, string> = {
  pass: 'Keep',
  fail: 'Drop',
  pending: 'Pending',
}

export function isEdgeColor(value: unknown): value is EdgeColor {
  return value === 'green' || value === 'yellow' || value === 'red'
}

export function defaultLabelForEdge(spec: VisionEdgeSpec): string | undefined {
  if (!spec.sourceHandle || !QUALIFY_SOURCE_NODES.has(spec.source)) return undefined
  return SOURCE_HANDLE_LABELS[spec.sourceHandle]
}

export function parseWorkflowCanvasEdgeMeta(raw: unknown): WorkflowCanvasEdgeMetaMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WorkflowCanvasEdgeMetaMap = {}
  for (const [edgeId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!edgeId || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Record<string, unknown>
    const meta: WorkflowCanvasEdgeMeta = {}
    if (typeof entry.label === 'string') meta.label = entry.label
    if (isEdgeColor(entry.color)) meta.color = entry.color
    if (meta.label !== undefined || meta.color !== undefined) out[edgeId] = meta
  }
  return out
}

export function mergeWorkflowCanvasEdgeMeta(
  existing: WorkflowCanvasEdgeMetaMap,
  incoming: WorkflowCanvasEdgeMetaMap
): WorkflowCanvasEdgeMetaMap {
  return { ...existing, ...incoming }
}

export function resolveEdgeLabel(
  edgeId: string,
  defaultLabel: string | undefined,
  meta: WorkflowCanvasEdgeMetaMap
): string | undefined {
  if (edgeId in meta) {
    const saved = meta[edgeId]?.label
    if (saved === '') return undefined
    if (typeof saved === 'string') return saved
  }
  return defaultLabel
}

export function resolveEdgeColor(
  edgeId: string,
  meta: WorkflowCanvasEdgeMetaMap
): EdgeColor {
  return meta[edgeId]?.color ?? DEFAULT_EDGE_COLOR
}
