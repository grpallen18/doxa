import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isCanonicalStepComplete } from '@/lib/admin/pipeline-status/canonical'
import {
  isChunkClaimsReviewStarted,
  isChunkPositionsReviewStarted,
  isExtractionStepComplete,
} from '@/lib/admin/pipeline-status/extraction'
import { getExtractionStepLane } from '@/lib/admin/pipeline-status/extraction-groups'
import { isIngestionStepComplete } from '@/lib/admin/pipeline-status/ingestion'
import { getLaneQaRevertTip } from '@/lib/admin/pipeline-status/qa-revert-tip'

const INGESTION_REVERT_SCOPE: PipelineStepId[] = [
  'relevance-gate',
  'review-pending-stories',
  'scrape-story-content',
  'clean-scraped-content',
  'chunk-story-bodies',
]

const CLAIMS_REVERT_SCOPE: PipelineStepId[] = [
  'extract-story-claims',
  'validate-chunk-claims',
  'refine-chunk-claims',
]

const POSITIONS_REVERT_SCOPE: PipelineStepId[] = [
  'extract-story-positions',
  'validate-chunk-positions',
  'refine-chunk-positions',
]

export const REVERT_SCOPE_STEP_IDS: PipelineStepId[] = [
  ...INGESTION_REVERT_SCOPE,
  ...CLAIMS_REVERT_SCOPE,
  ...POSITIONS_REVERT_SCOPE,
]

const CLAIMS_POST_REVERT_STEP_IDS: PipelineStepId[] = [
  'merge-story-claims',
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
  'link-canonical-claims',
  'link-canonical-events',
  'link-canonical-positions',
  'update-stances',
]

const SHARED_MERGE_QA_STEP_IDS: PipelineStepId[] = [
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
]

const CANONICAL_REVERT_STEP_IDS: PipelineStepId[] = [
  'link-canonical-claims',
  'link-canonical-events',
  'link-canonical-positions',
  'update-stances',
]

export function isReviewPendingActuallyRan(payload: StoryExtractionReviewPayload): boolean {
  if (payload.story.pending_review_ran_at) return true
  const tags = payload.story.relevance_tags ?? []
  return tags.includes('unclear_after_review')
}

function latestIngestionRevertTip(payload: StoryExtractionReviewPayload): PipelineStepId | null {
  let lastCompleted: PipelineStepId | null = null
  for (const stepId of INGESTION_REVERT_SCOPE) {
    if (stepId === 'review-pending-stories') {
      if (isReviewPendingActuallyRan(payload)) lastCompleted = stepId
      continue
    }
    if (isIngestionStepComplete(stepId, payload)) {
      lastCompleted = stepId
    }
  }
  return lastCompleted
}

function getExtractionLaneRevertTip(
  lane: 'claims' | 'positions',
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  return getLaneQaRevertTip(lane, payload)
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

function hasClaimsLanePostProgress(payload: StoryExtractionReviewPayload): boolean {
  if (payload.claims.length > 0 || payload.evidence.length > 0) return true
  return CLAIMS_POST_REVERT_STEP_IDS.some((stepId) =>
    isPostValidateStepComplete(stepId, payload)
  )
}

function hasPositionsLanePostProgress(payload: StoryExtractionReviewPayload): boolean {
  return payload.positions.length > 0
}

function hasSharedMergeQaProgress(payload: StoryExtractionReviewPayload): boolean {
  return SHARED_MERGE_QA_STEP_IDS.some((stepId) =>
    isExtractionStepComplete(stepId, payload)
  )
}

function hasCanonicalProgress(payload: StoryExtractionReviewPayload): boolean {
  return CANONICAL_REVERT_STEP_IDS.some((stepId) =>
    isCanonicalStepComplete(stepId, payload)
  )
}

export function isStepRevertBlocked(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const lane = getExtractionStepLane(stepId)

  if (lane === 'claims') {
    if (hasClaimsLanePostProgress(payload)) return true
    if (hasSharedMergeQaProgress(payload)) return true
    if (hasCanonicalProgress(payload)) return true
    if (stepId === 'extract-story-claims' && isChunkClaimsReviewStarted(payload)) return true
    return false
  }

  if (lane === 'positions') {
    if (hasPositionsLanePostProgress(payload)) return true
    if (hasSharedMergeQaProgress(payload)) return true
    if (hasCanonicalProgress(payload)) return true
    if (stepId === 'extract-story-positions' && isChunkPositionsReviewStarted(payload)) return true
    return false
  }

  if (hasClaimsLanePostProgress(payload)) return true
  if (hasPositionsLanePostProgress(payload)) return true
  if (hasSharedMergeQaProgress(payload)) return true
  if (hasCanonicalProgress(payload)) return true
  if (isChunkClaimsReviewStarted(payload)) return true
  if (isChunkPositionsReviewStarted(payload)) return true
  return false
}

export function hasPostRevertScopeProgress(payload: StoryExtractionReviewPayload): boolean {
  return (
    hasClaimsLanePostProgress(payload) ||
    hasPositionsLanePostProgress(payload) ||
    hasSharedMergeQaProgress(payload) ||
    hasCanonicalProgress(payload)
  )
}

export function getRevertBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (REVERT_SCOPE_STEP_IDS.some((stepId) => isStepRevertible(stepId, payload))) {
    return null
  }
  if (!hasPostRevertScopeProgress(payload) && !isChunkClaimsReviewStarted(payload) && !isChunkPositionsReviewStarted(payload)) {
    return null
  }
  if (isChunkClaimsReviewStarted(payload) || isChunkPositionsReviewStarted(payload)) {
    return 'Revert the latest completed review or refine step in each lane before earlier extract steps.'
  }
  return 'Later merge or canonical steps have progress. Use Clear extraction first.'
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

  const lane = getExtractionStepLane(stepId)
  if (lane === 'claims') {
    return getExtractionLaneRevertTip('claims', payload) === stepId
  }
  if (lane === 'positions') {
    return getExtractionLaneRevertTip('positions', payload) === stepId
  }
  return latestIngestionRevertTip(payload) === stepId
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
      return 'Clears claims extraction JSON on chunks; chunks are kept.'
    case 'validate-chunk-claims':
      return 'Undoes the latest chunk claims review pass (one cycle). Keeps extraction JSON; restores the prior review state when re-reviewing after refine.'
    case 'refine-chunk-claims':
      return 'Undoes the latest chunk claims refinement pass. Restores pre-refine extraction JSON and keeps the review findings that requested refinement.'
    case 'extract-story-positions':
      return 'Clears positions extraction JSON on chunks; chunks are kept.'
    case 'validate-chunk-positions':
      return 'Undoes the latest chunk positions review pass (one cycle). Keeps extraction JSON; restores the prior review state when re-reviewing after refine.'
    case 'refine-chunk-positions':
      return 'Undoes the latest chunk positions refinement pass. Restores pre-refine extraction JSON and keeps the review findings that requested refinement.'
    default:
      return 'Reverts this pipeline step.'
  }
}
