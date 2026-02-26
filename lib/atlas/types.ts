import type {
  VizNode,
  SourceDetail,
  OuterNode,
  ViewpointDetail,
  ControversyDetail,
} from '@/components/atlas/types'

export type { OuterNode, ViewpointDetail, ControversyDetail } from '@/components/atlas/types'

/** Unified scope API response shape */
export interface ScopeResponse {
  centerNode: VizNode
  centerDescription: string
  outerNodes: OuterNode[]
  sourceDetails?: SourceDetail[]
  viewpointDetails?: ViewpointDetail[]
  controversyDetails?: ControversyDetail[]
}
