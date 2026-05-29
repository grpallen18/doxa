import type {
  VizNode,
  SourceDetail,
  OuterNode,
  ViewpointDetail,
  ControversyDetail,
  PositionDetail,
  ClaimDetail,
  AgreementSideTrace,
} from '@/components/atlas/types'

export type {
  OuterNode,
  ViewpointDetail,
  ControversyDetail,
  PositionDetail,
  ClaimDetail,
  AgreementSideTrace,
} from '@/components/atlas/types'

/** Unified scope API response shape */
export interface ScopeResponse {
  centerNode: VizNode
  centerDescription: string
  outerNodes: OuterNode[]
  sourceDetails?: SourceDetail[]
  viewpointDetails?: ViewpointDetail[]
  controversyDetails?: ControversyDetail[]
  positionDetails?: PositionDetail[]
  claimDetails?: ClaimDetail[]
  agreementSides?: AgreementSideTrace[]
  lineage_relationship_ids?: string[]
}
