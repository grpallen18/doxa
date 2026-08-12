import type {
  NeoEdgeType,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'

/** Shared selection payload for Sigma + Union 3D detail drawers. */
export type NeoSelection = {
  nodeId: string | null
  kind: NeoNodeKind | null
  label: string | null
  charStart?: number
  charEnd?: number
  properties: Record<string, unknown> | null
  memberIds?: string[] | null
  edgeId: string | null
  edgeType: NeoEdgeType | null
  edgeLabel: string | null
  edgeProperties: Record<string, unknown> | null
  edgeSource: string | null
  edgeTarget: string | null
}

export const EMPTY_SELECTION: NeoSelection = {
  nodeId: null,
  kind: null,
  label: null,
  properties: null,
  memberIds: null,
  edgeId: null,
  edgeType: null,
  edgeLabel: null,
  edgeProperties: null,
  edgeSource: null,
  edgeTarget: null,
}
