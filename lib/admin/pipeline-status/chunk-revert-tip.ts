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
    const revertedAt = artifact.reverted_at
    if (revertedAt) continue
    if (!latest || artifact.created_at > latest) {
      latest = artifact.created_at
    }
  }
  return latest
}

/** Per-chunk revert tip — one step at a time through review/refine loops. */
export function getChunkLaneQaRevertTip(
  lane: QaLaneId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload
): PipelineStepId | null {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const phase = deriveChunkLanePhase(lane, chunk)
  const chunkIndex = chunk.chunk_index

  if (phase === 'awaiting_review' && (chunk[stages.refinementCountKey] ?? 0) > 0) {
    const latestReviewAt = latestArtifactCreatedAtForChunk(payload, stages.review, chunkIndex)
    const latestRefineAt = latestArtifactCreatedAtForChunk(payload, stages.refine, chunkIndex)
    if (latestRefineAt && (!latestReviewAt || latestRefineAt >= latestReviewAt)) {
      return stages.validateStep as PipelineStepId
    }
  }

  if (
    phase === 'awaiting_refine' ||
    phase === 'complete' ||
    phase === 'needs_human' ||
    (phase === 'awaiting_review' && chunk[stages.reviewReportKey] != null)
  ) {
    if (latestArtifactCreatedAtForChunk(payload, stages.review, chunkIndex)) {
      return stages.validateStep as PipelineStepId
    }
  }

  if (chunk[stages.extractionJsonKey] != null) {
    return stages.extractStep as PipelineStepId
  }

  return null
}

export function chunkHasRefineArtifact(
  payload: StoryExtractionReviewPayload,
  lane: QaLaneId,
  chunkIndex: number
): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return latestArtifactCreatedAtForChunk(payload, stages.refine, chunkIndex) != null
}

/** Shown when refine is runnable but revert is blocked after a partial / timed-out refine. */
export function getChunkRefineRecoveryMessage(
  _stepId: PipelineStepId,
  _chunk: ChunkRow,
  _payload: StoryExtractionReviewPayload
): string | null {
  return null
}
