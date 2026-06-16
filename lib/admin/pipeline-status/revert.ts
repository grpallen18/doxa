import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isStepComplete } from '@/lib/admin/pipeline-status'
import {
  isChunkClaimsReviewStarted,
} from '@/lib/admin/pipeline-status/extraction'
import { getExtractionStepLane, isChunkParallelStep } from '@/lib/admin/pipeline-status/extraction-groups'
import { getLaneQaRevertTip } from '@/lib/admin/pipeline-status/qa-revert-tip'
import { getChunkLaneQaRevertTip } from '@/lib/admin/pipeline-status/chunk-revert-tip'
import type { ChunkRow } from '@/lib/admin/pipeline-status/chunk-phase'
import { canUndoHumanOverride } from '@/lib/admin/qa-override'

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
  'approve-chunk-claims',
]

export const REVERT_SCOPE_STEP_IDS: PipelineStepId[] = [
  ...INGESTION_REVERT_SCOPE,
  ...CLAIMS_REVERT_SCOPE,
]

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

function hasMergeOutput(payload: StoryExtractionReviewPayload): boolean {
  return (
    payload.story.merged_at != null ||
    payload.claims.length > 0 ||
    payload.evidence.length > 0 ||
    payload.positions.length > 0
  )
}

function hasLegacyDownstreamProgress(payload: StoryExtractionReviewPayload): boolean {
  if (hasMergeOutput(payload)) return true
  const qa = payload.story.extraction_qa_status
  return qa != null && qa !== 'pending' && payload.story.merged_at != null
}

export function isStepRevertBlocked(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const lane = getExtractionStepLane(stepId)

  if (lane === 'claims') {
    if (hasLegacyDownstreamProgress(payload)) return true
    if (stepId === 'extract-story-claims' && isChunkClaimsReviewStarted(payload)) return true
    return false
  }

  if (hasLegacyDownstreamProgress(payload)) return true
  if (isChunkClaimsReviewStarted(payload)) return true
  return false
}

export function hasPostRevertScopeProgress(payload: StoryExtractionReviewPayload): boolean {
  return hasLegacyDownstreamProgress(payload)
}

export function getRevertBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (REVERT_SCOPE_STEP_IDS.some((stepId) => isStepRevertible(stepId, payload))) {
    return null
  }
  if (!hasPostRevertScopeProgress(payload) && !isChunkClaimsReviewStarted(payload)) {
    return null
  }
  if (isChunkClaimsReviewStarted(payload)) {
    return 'Revert chunk review before earlier extract steps.'
  }
  return 'Legacy merge or canonical data exists on this story. Clear extraction or undo overrides first.'
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
  if (isChunkParallelStep(stepId)) return false

  const lane = getExtractionStepLane(stepId)
  if (lane === 'claims') {
    return getLaneQaRevertTip('claims', payload) === stepId
  }
  return latestIngestionRevertTip(payload) === stepId
}

export function isChunkStepRevertible(
  stepId: PipelineStepId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload
): boolean {
  if (!REVERT_SCOPE_STEP_IDS.includes(stepId)) return false
  if (isStepRevertBlocked(stepId, payload)) return false

  const lane = getExtractionStepLane(stepId)
  if (lane !== 'claims') return false

  return getChunkLaneQaRevertTip('claims', chunk, payload) === stepId
}

export function getChunkStepRevertBlockedReason(
  stepId: PipelineStepId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload
): string | null {
  if (!REVERT_SCOPE_STEP_IDS.includes(stepId)) return null

  const lane = getExtractionStepLane(stepId)
  if (lane !== 'claims') return null

  if (getChunkLaneQaRevertTip('claims', chunk, payload) !== stepId) return null
  if (isChunkStepRevertible(stepId, chunk, payload)) return null

  const storyPassedWithoutMerge =
    payload.story.extraction_qa_status === 'passed' &&
    payload.story.merged_at == null &&
    payload.claims.length === 0 &&
    payload.evidence.length === 0

  if (storyPassedWithoutMerge) {
    if (canUndoHumanOverride(payload)) {
      return 'Chunk revert is blocked because human QA approval set story-level merge QA to passed. Use Undo human approval first.'
    }
    return 'Chunk revert is blocked because merge QA was marked passed at story level without a merge. Clear story QA status or undo the override first.'
  }

  if (hasLegacyDownstreamProgress(payload)) {
    return getRevertBlockedReason(payload) ?? 'Chunk revert is blocked by legacy merge or canonical data.'
  }

  return getRevertBlockedReason(payload) ?? 'Chunk revert is not available for this step right now.'
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
    case 'chunk-story-bodies':
      return 'Deletes all story chunks for this story.'
    case 'extract-story-claims':
      return 'Clears claims extraction JSON on chunks; chunks are kept.'
    case 'validate-chunk-claims':
      return 'Undoes the latest chunk claims review pass (one cycle). Keeps extraction JSON; restores the prior review state.'
    case 'refine-chunk-claims':
      return 'Undoes the latest claims repair pass for this chunk. Restores prior version and merge parking state.'
    case 'approve-chunk-claims':
      return 'Undoes the latest claims approval pass for this chunk. Returns chunk to awaiting approval.'
    default:
      return 'Reverts this pipeline step.'
  }
}
