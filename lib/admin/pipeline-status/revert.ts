import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isCanonicalStepComplete } from '@/lib/admin/pipeline-status/canonical'
import {
  isChunkClaimsReviewComplete,
  isExtractionStepComplete,
} from '@/lib/admin/pipeline-status/extraction'
import { isIngestionStepComplete } from '@/lib/admin/pipeline-status/ingestion'

export const REVERT_SCOPE_STEP_IDS: PipelineStepId[] = [
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
  'chunk-story-bodies',
  'extract-story-claims',
  'validate-chunk-claims',
]

/** Steps after review chunk claims — revert is blocked once any of these complete. */
const POST_VALIDATE_REVERT_STEP_IDS: PipelineStepId[] = [
  'merge-story-claims',
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
  'link-canonical-claims',
  'link-canonical-events',
  'link-canonical-positions',
  'update-stances',
]

const INGESTION_REVERT_STEPS = new Set<PipelineStepId>([
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
])

const EXTRACTION_REVERT_STEPS = new Set<PipelineStepId>([
  'chunk-story-bodies',
  'extract-story-claims',
  'validate-chunk-claims',
])

export function isReviewPendingActuallyRan(payload: StoryExtractionReviewPayload): boolean {
  if (payload.story.pending_review_ran_at) return true
  const tags = payload.story.relevance_tags ?? []
  return tags.includes('unclear_after_review')
}

function isStepCompletedForRevertTip(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (stepId === 'review-pending-stories') {
    return isReviewPendingActuallyRan(payload)
  }
  if (stepId === 'validate-chunk-claims') {
    return isChunkClaimsReviewComplete(payload)
  }
  if (INGESTION_REVERT_STEPS.has(stepId)) {
    return isIngestionStepComplete(stepId, payload)
  }
  if (EXTRACTION_REVERT_STEPS.has(stepId)) {
    return isExtractionStepComplete(stepId, payload)
  }
  return false
}

function isPostValidateStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (stepId.startsWith('link-') || stepId === 'update-stances') {
    return isCanonicalStepComplete(stepId, payload)
  }
  return isExtractionStepComplete(stepId, payload)
}

export function hasPostRevertScopeProgress(payload: StoryExtractionReviewPayload): boolean {
  return POST_VALIDATE_REVERT_STEP_IDS.some((stepId) =>
    isPostValidateStepComplete(stepId, payload)
  )
}

export function getRevertBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (!hasPostRevertScopeProgress(payload)) return null
  return 'Later merge or canonical steps have progress. Use Clear extraction first.'
}

export function getRevertibleStepId(
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  if (hasPostRevertScopeProgress(payload)) return null

  let lastCompleted: PipelineStepId | null = null
  for (const stepId of REVERT_SCOPE_STEP_IDS) {
    if (isStepCompletedForRevertTip(stepId, payload)) {
      lastCompleted = stepId
    }
  }

  return lastCompleted
}

export function isStepRevertible(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (!REVERT_SCOPE_STEP_IDS.includes(stepId)) return false
  return getRevertibleStepId(payload) === stepId
}

export function getRevertStepDescription(stepId: PipelineStepId): string {
  switch (stepId) {
    case 'relevance-gate':
      return 'Clears qualification (Keep/Drop/Pending) so the story can be qualified again.'
    case 'review-pending-stories':
      return 'Returns the story to Pending qualification so pending review can run again.'
    case 'scrape-story-content':
      return 'Clears scrape state and removes scraped body text.'
    case 'clean-scraped-content':
      return 'Clears cleaned body text; raw scrape is kept.'
    case 'chunk-story-bodies':
      return 'Deletes all story chunks for this story.'
    case 'extract-story-claims':
      return 'Clears extraction JSON on chunks; chunks are kept.'
    case 'validate-chunk-claims':
      return 'Clears chunk validation QA on extracted chunks so review can run again.'
    default:
      return 'Reverts this pipeline step.'
  }
}
