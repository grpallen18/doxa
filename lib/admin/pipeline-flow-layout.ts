import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  CLAIMS_LANE_STEP_IDS,
  POSITIONS_LANE_STEP_IDS,
} from '@/lib/admin/pipeline-status/extraction-groups'

export type FlowPlaceholderStepId = 'review-merged-positions' | 'refine-merged-positions'

export type FlowChartStepId = PipelineStepId | FlowPlaceholderStepId

export function isFlowPlaceholderStep(stepId: string): stepId is FlowPlaceholderStepId {
  return stepId === 'review-merged-positions' || stepId === 'refine-merged-positions'
}

export type FlowLayoutRow =
  | { kind: 'step'; stepId: PipelineStepId }
  | {
      kind: 'parallel'
      lanes: Array<{ id: string; label: string; stepIds: readonly PipelineStepId[] }>
    }
  | {
      kind: 'dual-trunk'
      lanes: Array<{ id: string; stepIds: readonly FlowChartStepId[] }>
    }

const INGESTION_FLOW_STEPS = [
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
] as const satisfies readonly PipelineStepId[]

const MERGE_QA_CLAIMS_STEP_IDS = [
  'review-merged-extraction',
  'refine-merged-extraction',
] as const satisfies readonly PipelineStepId[]

const MERGE_QA_POSITIONS_PLACEHOLDER_STEP_IDS = [
  'review-merged-positions',
  'refine-merged-positions',
] as const satisfies readonly FlowPlaceholderStepId[]

export const LIFECYCLE_FLOW_ROWS: FlowLayoutRow[] = [
  ...INGESTION_FLOW_STEPS.map((stepId) => ({ kind: 'step' as const, stepId })),
  { kind: 'step', stepId: 'chunk-story-bodies' },
  {
    kind: 'parallel',
    lanes: [
      { id: 'claims', label: 'Claims', stepIds: CLAIMS_LANE_STEP_IDS },
      { id: 'positions', label: 'Positions', stepIds: POSITIONS_LANE_STEP_IDS },
    ],
  },
  {
    kind: 'dual-trunk',
    lanes: [
      { id: 'claims', stepIds: MERGE_QA_CLAIMS_STEP_IDS },
      { id: 'positions', stepIds: MERGE_QA_POSITIONS_PLACEHOLDER_STEP_IDS },
    ],
  },
  { kind: 'step', stepId: 'validate-merged-extraction' },
]

function collectDualTrunkPipelineStepIds(
  lanes: Array<{ stepIds: readonly FlowChartStepId[] }>
): PipelineStepId[] {
  const ids: PipelineStepId[] = []
  for (const lane of lanes) {
    for (const stepId of lane.stepIds) {
      if (!isFlowPlaceholderStep(stepId)) ids.push(stepId)
    }
  }
  return ids
}

export function lifecycleFlowStepIds(): PipelineStepId[] {
  const ids: PipelineStepId[] = []
  for (const row of LIFECYCLE_FLOW_ROWS) {
    if (row.kind === 'step') ids.push(row.stepId)
    else if (row.kind === 'parallel') {
      for (const lane of row.lanes) ids.push(...lane.stepIds)
    } else {
      ids.push(...collectDualTrunkPipelineStepIds(row.lanes))
    }
  }
  return ids
}

/** Steps that must be satisfied before Link entities (validate-merged-extraction) can run. */
export function linkEntitiesPrerequisiteStepIds(): PipelineStepId[] {
  const ids: PipelineStepId[] = []
  for (const row of LIFECYCLE_FLOW_ROWS) {
    if (row.kind === 'step' && row.stepId === 'validate-merged-extraction') break
    if (row.kind === 'step') ids.push(row.stepId)
    else if (row.kind === 'parallel') {
      for (const lane of row.lanes) ids.push(...lane.stepIds)
    } else {
      ids.push(...collectDualTrunkPipelineStepIds(row.lanes))
    }
  }
  return ids
}
