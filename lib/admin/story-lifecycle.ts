import {
  PIPELINE_STAGES,
  PIPELINE_STEPS,
  type PipelineStepId,
} from '@/lib/admin/generated/pipeline-catalog'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

const canonicalStage = PIPELINE_STAGES.find((s) => s.id === 'canonical')
const preCanonicalStages = PIPELINE_STAGES.filter((s) => s.id !== 'canonical')

export const STORY_LIFECYCLE_STEP_IDS: PipelineStepId[] = preCanonicalStages.flatMap(
  (s) => s.stepIds as PipelineStepId[]
)

export const POST_MERGE_STEP_IDS: PipelineStepId[] = (canonicalStage?.stepIds ??
  []) as PipelineStepId[]

export const LIFECYCLE_PHASES: Array<{
  id: string
  label: string
  stepIds: PipelineStepId[]
}> = [
  {
    id: 'ingestion',
    label: 'Ingestion',
    stepIds: (PIPELINE_STAGES.find((s) => s.id === 'ingestion')?.stepIds ??
      []) as PipelineStepId[],
  },
  {
    id: 'extraction',
    label: 'Extraction',
    stepIds: (PIPELINE_STAGES.find((s) => s.id === 'extraction')?.stepIds ??
      []) as PipelineStepId[],
  },
]

export function storyHubStepHref(storyId: string, stepId: PipelineStepId): string {
  return `/admin/stories/${storyId}#step-${stepId}`
}

export function storyHubSectionHref(storyId: string, sectionId: string): string {
  return `/admin/stories/${storyId}#${sectionId}`
}

export function getNextRunnableLifecycleStep(
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  const checklist = derivePipelineChecklist(payload)
  for (const stepId of STORY_LIFECYCLE_STEP_IDS) {
    const step = checklist.steps.find((s) => s.id === stepId)
    if (step?.runnable) return stepId
  }
  return null
}

export function getNextRunnablePostMergeStep(
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  const checklist = derivePipelineChecklist(payload)
  for (const stepId of POST_MERGE_STEP_IDS) {
    const step = checklist.steps.find((s) => s.id === stepId)
    if (step?.runnable) return stepId
  }
  return null
}

export function getCatalogStep(stepId: PipelineStepId) {
  return PIPELINE_STEPS.find((s) => s.id === stepId) ?? null
}
