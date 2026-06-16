import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  QA_LANE_ARTIFACT_STAGES,
  type QaLaneId,
} from '@/lib/admin/pipeline-status/qa-lane-stages'
import { isExtractionStepComplete } from '@/lib/admin/pipeline-status/extraction'

export const MAX_CHUNK_QA_REFINEMENT_ATTEMPTS = 3
export const MAX_CHUNK_QA_VALIDATION_ATTEMPTS = 3

/** Chunk still waiting for its first review pass (not a re-review after refine). */
export function isChunkAwaitingFirstReview(
  lane: QaLaneId,
  chunk: StoryExtractionReviewPayload['chunks'][number]
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const status = chunk[stages.qaStatusKey]
  return (
    chunk[stages.extractionJsonKey] != null &&
    (status == null || status === 'pending') &&
    chunk[stages.reviewReportKey] == null &&
    (chunk[stages.refinementCountKey] ?? 0) === 0
  )
}

/** Chunk was refined and is queued for another review pass. */
export function isChunkPendingRereviewAfterRefine(
  lane: QaLaneId,
  chunk: StoryExtractionReviewPayload['chunks'][number]
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const status = chunk[stages.qaStatusKey]
  return (
    chunk[stages.extractionJsonKey] != null &&
    status === 'pending' &&
    (chunk[stages.refinementCountKey] ?? 0) > 0 &&
    chunk[stages.reviewReportKey] != null
  )
}

export function laneHasChunksNeedingRefinement(
  lane: QaLaneId,
  payload: StoryExtractionReviewPayload
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return payload.chunks.some(
    (chunk) =>
      chunk[stages.extractionJsonKey] != null &&
      chunk[stages.qaStatusKey] === 'needs_refinement'
  )
}

export function laneHasChunksPendingRereview(
  lane: QaLaneId,
  payload: StoryExtractionReviewPayload
): boolean {
  return payload.chunks.some((chunk) => isChunkPendingRereviewAfterRefine(lane, chunk))
}

/** Chunk passed review with fixable findings and is eligible for another refine pass. */
export function isChunkReadyForLaneRefine(
  lane: QaLaneId,
  chunk: StoryExtractionReviewPayload['chunks'][number]
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  if (chunk[stages.extractionJsonKey] == null) return false

  const status = chunk[stages.qaStatusKey]
  if (status !== 'needs_refinement') return false

  const refinementCount = chunk[stages.refinementCountKey] ?? 0
  const validationAttempts = chunk[stages.validationAttemptCountKey] ?? 0
  return (
    refinementCount < MAX_CHUNK_QA_REFINEMENT_ATTEMPTS &&
    validationAttempts < MAX_CHUNK_QA_VALIDATION_ATTEMPTS
  )
}

export function laneHasChunksReadyToRefine(
  lane: QaLaneId,
  payload: StoryExtractionReviewPayload
): boolean {
  return payload.chunks.some((chunk) => isChunkReadyForLaneRefine(lane, chunk))
}

/** Refine only needs upstream extract; do not wait for every chunk's first review. */
export function refineLanePriorOk(
  lane: QaLaneId,
  payload: StoryExtractionReviewPayload
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return isExtractionStepComplete(stages.extractStep as PipelineStepId, payload)
}
