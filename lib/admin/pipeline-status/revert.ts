import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isStepComplete } from '@/lib/admin/pipeline-status'
import type { ChunkRow } from '@/lib/admin/pipeline-status/chunk-phase'

const INGESTION_REVERT_SCOPE: PipelineStepId[] = [
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
]

export const REVERT_SCOPE_STEP_IDS: PipelineStepId[] = [...INGESTION_REVERT_SCOPE]

export function isReviewPendingActuallyRan(payload: StoryExtractionReviewPayload): boolean {
  if (payload.story.pending_review_ran_at) return true
  const tags = payload.story.relevance_tags ?? []
  return tags.includes('unclear_after_review')
}

function isIngestionRevertScopeStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  return isStepComplete(stepId, payload)
}

function latestIngestionRevertTip(payload: StoryExtractionReviewPayload): PipelineStepId | null {
  let lastCompleted: PipelineStepId | null = null
  for (const stepId of INGESTION_REVERT_SCOPE) {
    if (stepId === 'review-pending-stories') {
      if (isReviewPendingActuallyRan(payload)) lastCompleted = stepId
      continue
    }
    if (isIngestionRevertScopeStepComplete(stepId, payload)) {
      lastCompleted = stepId
    }
  }
  return lastCompleted
}

export function isStepRevertBlocked(
  _stepId: PipelineStepId,
  _payload: StoryExtractionReviewPayload
): boolean {
  return false
}

export function hasPostRevertScopeProgress(_payload: StoryExtractionReviewPayload): boolean {
  return false
}

export function getRevertBlockedReason(_payload: StoryExtractionReviewPayload): string | null {
  return null
}

export function getRevertibleStepId(
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  for (const stepId of REVERT_SCOPE_STEP_IDS) {
    if (isStepRevertible(stepId, payload)) return stepId
  }
  return null
}

export function isStepRevertible(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (!REVERT_SCOPE_STEP_IDS.includes(stepId)) return false
  if (isStepRevertBlocked(stepId, payload)) return false
  return latestIngestionRevertTip(payload) === stepId
}

export function isChunkStepRevertible(
  _stepId: PipelineStepId,
  _chunk: ChunkRow,
  _payload: StoryExtractionReviewPayload
): boolean {
  return false
}

export function getChunkStepRevertBlockedReason(
  _stepId: PipelineStepId,
  _chunk: ChunkRow,
  _payload: StoryExtractionReviewPayload
): string | null {
  return null
}

export function getRevertStepDescription(stepId: PipelineStepId): string {
  switch (stepId) {
    case 'relevance-gate':
      return 'Clears qualification (Keep/Drop/Pending). Blocked until downstream steps are reverted — the error lists what remains.'
    case 'review-pending-stories':
      return 'Returns the story to Pending qualification so pending review can run again.'
    case 'scrape-story-content':
      return 'Clears scrape state and removes scraped body text.'
    case 'clean-scraped-content':
      return 'Clears cleaned body text; raw scrape is kept.'
    default:
      return 'Reverts this pipeline step.'
  }
}
