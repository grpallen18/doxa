import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export function getStoryStepExportOutput(
  _stepId: PipelineStepId,
  _payload: StoryExtractionReviewPayload
): unknown | null {
  return null
}
