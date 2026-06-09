import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type ExtractionStepGroup = {
  id: string
  label: string
  description: string
  stepIds: PipelineStepId[]
}

export type ExtractionLaneId = 'shared' | 'claims' | 'positions' | 'merge-qa'

export const EXTRACTION_SHARED_STEP_IDS = ['chunk-story-bodies'] as const satisfies readonly PipelineStepId[]

export const CLAIMS_LANE_STEP_IDS = [
  'extract-story-claims',
  'validate-chunk-claims',
  'refine-chunk-claims',
  'merge-story-claims',
] as const satisfies readonly PipelineStepId[]

export const POSITIONS_LANE_STEP_IDS = [
  'extract-story-positions',
  'validate-chunk-positions',
  'refine-chunk-positions',
  'merge-story-positions',
] as const satisfies readonly PipelineStepId[]

export const MERGE_QA_STEP_IDS = [
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
] as const satisfies readonly PipelineStepId[]

export const EXTRACTION_PARALLEL_LANES: Array<{
  id: ExtractionLaneId
  label: string
  stepIds: readonly PipelineStepId[]
}> = [
  { id: 'claims', label: 'Claims', stepIds: CLAIMS_LANE_STEP_IDS },
  { id: 'positions', label: 'Positions', stepIds: POSITIONS_LANE_STEP_IDS },
]

export const EXTRACTION_STEP_GROUPS: ExtractionStepGroup[] = [
  {
    id: 'core',
    label: 'Chunk',
    description: 'Split the clean body into chunks before parallel extract/review lanes.',
    stepIds: [...EXTRACTION_SHARED_STEP_IDS],
  },
  {
    id: 'claims-lane',
    label: 'Claims',
    description: 'Extract, review, refine, and merge primary claims.',
    stepIds: [...CLAIMS_LANE_STEP_IDS],
  },
  {
    id: 'positions-lane',
    label: 'Positions',
    description: 'Extract, review, refine, and merge positions in parallel with claims.',
    stepIds: [...POSITIONS_LANE_STEP_IDS],
  },
  {
    id: 'merge-qa',
    label: 'Merge approval',
    description: 'Review, refine when needed, and approve merged extraction before canonicalization.',
    stepIds: [...MERGE_QA_STEP_IDS],
  },
]

export const EXTRACTION_TIMELINE_HIDDEN_STEPS = new Set<PipelineStepId>([
  'validate-chunk-claims',
  'validate-chunk-positions',
  'merge-story-claims',
  'merge-story-positions',
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
])

const LANE_BY_STEP = new Map<PipelineStepId, ExtractionLaneId>([
  ...EXTRACTION_SHARED_STEP_IDS.map((id) => [id, 'shared'] as const),
  ...CLAIMS_LANE_STEP_IDS.map((id) => [id, 'claims'] as const),
  ...POSITIONS_LANE_STEP_IDS.map((id) => [id, 'positions'] as const),
  ...MERGE_QA_STEP_IDS.map((id) => [id, 'merge-qa'] as const),
])

export function getExtractionStepLane(stepId: PipelineStepId): ExtractionLaneId | null {
  return LANE_BY_STEP.get(stepId) ?? null
}

export function getExtractionLaneStepIds(laneId: ExtractionLaneId): readonly PipelineStepId[] {
  switch (laneId) {
    case 'shared':
      return EXTRACTION_SHARED_STEP_IDS
    case 'claims':
      return CLAIMS_LANE_STEP_IDS
    case 'positions':
      return POSITIONS_LANE_STEP_IDS
    case 'merge-qa':
      return MERGE_QA_STEP_IDS
  }
}
