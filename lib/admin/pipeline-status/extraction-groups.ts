import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type ExtractionStepGroup = {
  id: string
  label: string
  description: string
  stepIds: PipelineStepId[]
}

export type ExtractionLaneId = 'shared' | 'claims'

export const EXTRACTION_SHARED_STEP_IDS = ['chunk-story-bodies'] as const satisfies readonly PipelineStepId[]

export const CLAIMS_LANE_STEP_IDS = [
  'extract-story-claims',
  'validate-chunk-claims',
  'refine-chunk-claims',
  'approve-chunk-claims',
] as const satisfies readonly PipelineStepId[]

/** Archived lanes — kept as empty for type compatibility where imports remain. */
export const POSITIONS_LANE_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export const MERGE_QA_STEP_IDS = [] as const satisfies readonly PipelineStepId[]

export const EXTRACTION_TIMELINE_HIDDEN_STEPS = ['review-pending-stories'] as const satisfies readonly PipelineStepId[]

/** Extract / review steps that run per chunk (not on the story canvas). */
export const CHUNK_PARALLEL_STEP_IDS = [
  'extract-story-claims',
  'validate-chunk-claims',
  'refine-chunk-claims',
  'approve-chunk-claims',
] as const satisfies readonly PipelineStepId[]

export function isChunkParallelStep(stepId: PipelineStepId): boolean {
  return (CHUNK_PARALLEL_STEP_IDS as readonly PipelineStepId[]).includes(stepId)
}

export const EXTRACTION_PARALLEL_LANES: Array<{
  id: ExtractionLaneId
  label: string
  stepIds: readonly PipelineStepId[]
}> = [{ id: 'claims', label: 'Claims', stepIds: CLAIMS_LANE_STEP_IDS }]

export const EXTRACTION_STEP_GROUPS: ExtractionStepGroup[] = [
  {
    id: 'core',
    label: 'Chunk',
    description: 'Split story body into chunks.',
    stepIds: ['chunk-story-bodies'],
  },
  {
    id: 'claims',
    label: 'Claims',
    description: 'Extract, review, refine, and approve primary claims per chunk.',
    stepIds: [...CLAIMS_LANE_STEP_IDS],
  },
]

export function getExtractionLaneStepIds(lane: ExtractionLaneId): readonly PipelineStepId[] {
  if (lane === 'shared') return EXTRACTION_SHARED_STEP_IDS
  if (lane === 'claims') return CLAIMS_LANE_STEP_IDS
  return []
}

export function getExtractionStepLane(stepId: PipelineStepId): ExtractionLaneId | null {
  if ((EXTRACTION_SHARED_STEP_IDS as readonly PipelineStepId[]).includes(stepId)) return 'shared'
  if ((CLAIMS_LANE_STEP_IDS as readonly PipelineStepId[]).includes(stepId)) return 'claims'
  return null
}

export function isExtractionLaneStep(stepId: PipelineStepId): boolean {
  return getExtractionStepLane(stepId) != null
}
