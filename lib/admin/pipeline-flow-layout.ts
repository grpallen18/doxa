import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { CLAIMS_LANE_STEP_IDS } from '@/lib/admin/pipeline-status/extraction-groups'

export type FlowLayoutRow =
  | { kind: 'step'; stepId: PipelineStepId }
  | {
      kind: 'parallel'
      lanes: Array<{ id: string; label: string; stepIds: readonly PipelineStepId[] }>
    }

const INGESTION_FLOW_STEPS = [
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
] as const satisfies readonly PipelineStepId[]

export const LIFECYCLE_FLOW_ROWS: FlowLayoutRow[] = [
  ...INGESTION_FLOW_STEPS.map((stepId) => ({ kind: 'step' as const, stepId })),
  { kind: 'step', stepId: 'chunk-story-bodies' },
  {
    kind: 'parallel',
    lanes: [{ id: 'claims', label: 'Claims', stepIds: CLAIMS_LANE_STEP_IDS }],
  },
]

export function lifecycleFlowStepIds(): PipelineStepId[] {
  const ids: PipelineStepId[] = []
  for (const row of LIFECYCLE_FLOW_ROWS) {
    if (row.kind === 'step') ids.push(row.stepId)
    else {
      for (const lane of row.lanes) ids.push(...lane.stepIds)
    }
  }
  return ids
}

/** Runnable prerequisite steps before the pipeline is considered complete at chunk review. */
export function linkEntitiesPrerequisiteStepIds(): PipelineStepId[] {
  return lifecycleFlowStepIds()
}
