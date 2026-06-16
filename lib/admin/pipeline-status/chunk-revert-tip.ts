import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { deriveChunkLanePhase, type ChunkRow } from '@/lib/admin/pipeline-status/chunk-phase'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'

function latestArtifactCreatedAtForChunk(
  payload: StoryExtractionReviewPayload,
  stages: readonly string[],
  chunkIndex: number
): string | null {
  let latest: string | null = null
  for (const artifact of payload.qa_artifacts) {
    if (artifact.chunk_index !== chunkIndex) continue
    if (!stages.includes(artifact.stage)) continue
    if (artifact.reverted_at) continue
    if (!latest || artifact.created_at > latest) {
      latest = artifact.created_at
    }
  }
  return latest
}

function hasArtifact(
  payload: StoryExtractionReviewPayload,
  stages: readonly string[],
  chunkIndex: number
): boolean {
  return latestArtifactCreatedAtForChunk(payload, stages, chunkIndex) != null
}

function chunkReviewHasRun(
  lane: QaLaneId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload,
  chunkIndex: number
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const status = chunk[stages.qaStatusKey]
  if (status != null && status !== 'pending') return true
  if (chunk[stages.reviewReportKey] != null) return true
  return hasArtifact(payload, stages.review, chunkIndex)
}

/**
 * Per-chunk revert tip — linear stack (extract → review → refine → approve).
 * Only the most recently completed step may be reverted.
 *
 * Uses lane phase (same source as runnable/next-action) so revert advances when
 * chunk row status moves forward, not only when QA artifacts appear in payload.
 */
export function getChunkLaneQaRevertTip(
  lane: QaLaneId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const chunkIndex = chunk.chunk_index

  if (hasArtifact(payload, stages.approve, chunkIndex)) {
    return stages.approveStep as PipelineStepId
  }

  const phase = deriveChunkLanePhase(lane, chunk)

  if (phase === 'awaiting_approval') {
    return stages.refineStep as PipelineStepId
  }

  if (phase === 'awaiting_refine') {
    return stages.validateStep as PipelineStepId
  }

  if (phase === 'awaiting_review') {
    if (chunk[stages.extractionJsonKey] != null) {
      return stages.extractStep as PipelineStepId
    }
    return null
  }

  if (phase === 'complete' || phase === 'needs_human') {
    const refinementCount = chunk[stages.refinementCountKey] ?? 0
    if (refinementCount > 0 || hasArtifact(payload, stages.refine, chunkIndex)) {
      return stages.refineStep as PipelineStepId
    }
    if (chunkReviewHasRun(lane, chunk, payload, chunkIndex)) {
      return stages.validateStep as PipelineStepId
    }
    if (chunk[stages.extractionJsonKey] != null) {
      return stages.extractStep as PipelineStepId
    }
    return null
  }

  return null
}

export function chunkHasRefineArtifact(
  payload: StoryExtractionReviewPayload,
  lane: QaLaneId,
  chunkIndex: number
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return hasArtifact(payload, stages.refine, chunkIndex)
}

/** Shown when refine is runnable but revert is blocked after a partial / timed-out refine. */
export function getChunkRefineRecoveryMessage(
  _stepId: PipelineStepId,
  _chunk: ChunkRow,
  _payload: StoryExtractionReviewPayload
): string | null {
  return null
}
