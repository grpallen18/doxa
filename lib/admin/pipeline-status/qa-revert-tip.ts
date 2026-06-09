import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  isChunkClaimsReviewStarted,
  isChunkPositionsReviewStarted,
  isExtractionStepComplete,
} from '@/lib/admin/pipeline-status/extraction'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'
import {
  laneHasChunksNeedingRefinement,
  laneHasChunksPendingRereview,
} from '@/lib/admin/pipeline-status/qa-lane-state'

function latestArtifactCreatedAt(
  payload: StoryExtractionReviewPayload,
  stages: readonly string[]
): string | null {
  let latest: string | null = null
  for (const artifact of payload.qa_artifacts) {
    if (!stages.includes(artifact.stage)) continue
    if (!latest || artifact.created_at > latest) {
      latest = artifact.created_at
    }
  }
  return latest
}

function laneHasRefineProgress(lane: QaLaneId, payload: StoryExtractionReviewPayload): boolean {
  const key = QA_LANE_ARTIFACT_STAGES[lane].refinementCountKey
  return payload.chunks.some((chunk) => (chunk[key] ?? 0) > 0)
}

function shouldTipRefineRevert(lane: QaLaneId, payload: StoryExtractionReviewPayload): boolean {
  if (laneHasChunksNeedingRefinement(lane, payload)) return false

  const { review, refine } = QA_LANE_ARTIFACT_STAGES[lane]
  const latestReviewAt = latestArtifactCreatedAt(payload, review)
  const latestRefineAt = latestArtifactCreatedAt(payload, refine)
  const hasRefineProgress = laneHasRefineProgress(lane, payload)

  if (!hasRefineProgress && !latestRefineAt) return false

  if (hasRefineProgress && !latestRefineAt) {
    return true
  }

  if (!latestReviewAt) {
    return Boolean(latestRefineAt)
  }

  return Boolean(latestRefineAt && latestRefineAt >= latestReviewAt)
}

/** Latest completed QA step in a chunk lane (one revert at a time through review/refine loops). */
export function getLaneQaRevertTip(
  lane: QaLaneId,
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]

  if (laneHasChunksPendingRereview(lane, payload) || shouldTipRefineRevert(lane, payload)) {
    return stages.refineStep
  }

  const reviewStarted =
    lane === 'claims' ? isChunkClaimsReviewStarted(payload) : isChunkPositionsReviewStarted(payload)
  if (
    laneHasChunksNeedingRefinement(lane, payload) ||
    reviewStarted ||
    latestArtifactCreatedAt(payload, stages.review)
  ) {
    return stages.validateStep
  }
  if (isExtractionStepComplete(stages.extractStep, payload)) {
    return stages.extractStep
  }
  return null
}
