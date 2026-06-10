import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EDGE_ATTACHMENTS_KEY,
  mergeWorkflowCanvasEdgeAttachments,
  parseWorkflowCanvasEdgeAttachments,
  type WorkflowCanvasEdgeAttachments,
} from '@/lib/admin/workflow-canvas/edge-attachments'
import {
  EDGE_META_KEY,
  mergeWorkflowCanvasEdgeMeta,
  parseWorkflowCanvasEdgeMeta,
  type WorkflowCanvasEdgeMetaMap,
} from '@/lib/admin/workflow-canvas/edge-meta'

export const WORKFLOW_CANVAS_LAYOUT_ID = 'global'

const RESERVED_LAYOUT_KEYS = new Set([EDGE_ATTACHMENTS_KEY, EDGE_META_KEY])

export type WorkflowCanvasPosition = { x: number; y: number }

export type WorkflowCanvasPositions = Record<string, WorkflowCanvasPosition>

export type WorkflowCanvasLayoutState = {
  positions: WorkflowCanvasPositions
  edgeAttachments: WorkflowCanvasEdgeAttachments
  edgeMeta: WorkflowCanvasEdgeMetaMap
}

export function isWorkflowCanvasPosition(value: unknown): value is WorkflowCanvasPosition {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y)
}

export function mergeWorkflowCanvasPositions(
  existing: WorkflowCanvasPositions,
  incoming: WorkflowCanvasPositions
): WorkflowCanvasPositions {
  return { ...existing, ...incoming }
}

export function parseWorkflowCanvasPositions(raw: unknown): WorkflowCanvasPositions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WorkflowCanvasPositions = {}
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string' || !id || RESERVED_LAYOUT_KEYS.has(id)) continue
    if (isWorkflowCanvasPosition(pos)) out[id] = { x: pos.x, y: pos.y }
  }
  return out
}

export function parseWorkflowCanvasLayout(raw: unknown): WorkflowCanvasLayoutState {
  const positions = parseWorkflowCanvasPositions(raw)
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null
  const edgeAttachments = record
    ? parseWorkflowCanvasEdgeAttachments(record[EDGE_ATTACHMENTS_KEY])
    : {}
  const edgeMeta = record ? parseWorkflowCanvasEdgeMeta(record[EDGE_META_KEY]) : {}
  return { positions, edgeAttachments, edgeMeta }
}

export function serializeWorkflowCanvasLayout(
  layout: WorkflowCanvasLayoutState
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...layout.positions }
  if (Object.keys(layout.edgeAttachments).length > 0) {
    out[EDGE_ATTACHMENTS_KEY] = layout.edgeAttachments
  }
  if (Object.keys(layout.edgeMeta).length > 0) {
    out[EDGE_META_KEY] = layout.edgeMeta
  }
  return out
}

export function mergeWorkflowCanvasLayout(
  existing: WorkflowCanvasLayoutState,
  incoming: Partial<WorkflowCanvasLayoutState>
): WorkflowCanvasLayoutState {
  return {
    positions: incoming.positions
      ? mergeWorkflowCanvasPositions(existing.positions, incoming.positions)
      : existing.positions,
    edgeAttachments: incoming.edgeAttachments
      ? mergeWorkflowCanvasEdgeAttachments(existing.edgeAttachments, incoming.edgeAttachments)
      : existing.edgeAttachments,
    edgeMeta: incoming.edgeMeta
      ? mergeWorkflowCanvasEdgeMeta(existing.edgeMeta, incoming.edgeMeta)
      : existing.edgeMeta,
  }
}

export async function fetchWorkflowCanvasLayout(
  supabase: SupabaseClient
): Promise<WorkflowCanvasLayoutState> {
  const { data, error } = await supabase
    .from('admin_workflow_canvas_layout')
    .select('positions')
    .eq('id', WORKFLOW_CANVAS_LAYOUT_ID)
    .maybeSingle()

  if (error) throw error
  return parseWorkflowCanvasLayout(data?.positions ?? {})
}

export async function saveWorkflowCanvasLayout(
  supabase: SupabaseClient,
  layout: WorkflowCanvasLayoutState,
  updatedBy: string | null
): Promise<void> {
  const { error } = await supabase.from('admin_workflow_canvas_layout').upsert({
    id: WORKFLOW_CANVAS_LAYOUT_ID,
    positions: serializeWorkflowCanvasLayout(layout),
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })

  if (error) throw error
}
