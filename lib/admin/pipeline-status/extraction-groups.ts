import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type ExtractionStepGroup = {
  id: string
  label: string
  description: string
  stepIds: PipelineStepId[]
}

export type ExtractionLaneId = 'shared' | 'claims'

/** Claims extraction removed — Neo graph path is primary. */
export const EXTRACTION_SHARED_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export const CLAIMS_LANE_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

/** Archived lanes — kept as empty for type compatibility where imports remain. */
export const POSITIONS_LANE_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export const MERGE_QA_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export const EXTRACTION_TIMELINE_HIDDEN_STEPS = ['review-pending-stories'] as const satisfies readonly PipelineStepId[]

/** Extract / review steps that run per chunk (not on the story canvas). */
export const CHUNK_PARALLEL_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export function isChunkParallelStep(_stepId: PipelineStepId): boolean {
  return false
}

export const EXTRACTION_PARALLEL_LANES: Array<{
  id: ExtractionLaneId
  label: string
  stepIds: readonly PipelineStepId[]
}> = []

export const EXTRACTION_STEP_GROUPS: ExtractionStepGroup[] = []

export function getExtractionLaneStepIds(lane: ExtractionLaneId): readonly PipelineStepId[] {
  if (lane === 'shared') return EXTRACTION_SHARED_STEP_IDS
  if (lane === 'claims') return CLAIMS_LANE_STEP_IDS
  return []
}

export function getExtractionStepLane(_stepId: PipelineStepId): ExtractionLaneId | null {
  return null
}

export function isExtractionLaneStep(stepId: PipelineStepId): boolean {
  return getExtractionStepLane(stepId) != null
}
