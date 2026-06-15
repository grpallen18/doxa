import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  deriveChunkLanePhase,
  type ChunkRow,
} from '@/lib/admin/pipeline-status/chunk-phase'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'

function laneForStep(stepId: PipelineStepId): QaLaneId | null {
  if (stepId === 'extract-story-claims' || stepId === 'validate-chunk-claims') {
    return 'claims'
  }
  return null
}

function chunkHasBody(chunk: ChunkRow): boolean {
  return chunk.content != null && chunk.content.length > 0
}

/** Whether a single chunk/lane step can run next (chunk-layer agent flow). */
export function isChunkStepRunnable(
  stepId: PipelineStepId,
  chunk: ChunkRow,
  payload: StoryExtractionReviewPayload
): boolean {
  const lane = laneForStep(stepId)
  if (!lane) return false

  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const phase = deriveChunkLanePhase(lane, chunk)

  if (stepId === stages.extractStep) {
    return chunkHasBody(chunk) && phase === 'not_started'
  }

  if (stepId === stages.validateStep) {
    if (chunk[stages.extractionJsonKey] == null) return false
    return phase === 'awaiting_review'
  }

  return false
}

/** Whether a chunk-layer step has no further work for this chunk (chunk canvas display). */
export function isChunkStepDomainComplete(
  stepId: PipelineStepId,
  chunk: ChunkRow
): boolean {
  const lane = laneForStep(stepId)
  if (!lane) return false
  const phase = deriveChunkLanePhase(lane, chunk)
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  if (stepId === stages.extractStep) {
    return phase !== 'not_started'
  }
  if (stepId === stages.validateStep) {
    return phase === 'complete' || phase === 'awaiting_refine' || phase === 'needs_human'
  }
  return false
}

export function chunkStepProgressLabel(
  stepId: PipelineStepId,
  chunk: ChunkRow
): string | null {
  const lane = laneForStep(stepId)
  if (!lane) return null
  const phase = deriveChunkLanePhase(lane, chunk)
  if (stepId === QA_LANE_ARTIFACT_STAGES[lane].extractStep) {
    return phase === 'not_started' ? 'Not extracted' : 'Extracted'
  }
  if (stepId === QA_LANE_ARTIFACT_STAGES[lane].validateStep) {
    if (phase === 'awaiting_review') return 'Awaiting review'
    if (phase === 'complete') return 'Review passed'
    if (phase === 'needs_human') return 'Needs human'
    if (phase === 'awaiting_refine') return 'Awaiting refine first'
    return 'Not ready'
  }
  return null
}

export function getChunkScopedStepSnapshot(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  chunkIndex: number
): unknown {
  const chunk = payload.chunks.find((c) => c.chunk_index === chunkIndex)
  if (!chunk) return { stepId, chunkIndex, missing: true }
  const lane = laneForStep(stepId)
  if (!lane) return { stepId, chunkIndex }
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  return {
    stepId,
    chunkIndex,
    phase: deriveChunkLanePhase(lane, chunk),
    extraction_json: chunk[stages.extractionJsonKey],
    qa_status: chunk[stages.qaStatusKey],
    refinement_count: chunk[stages.refinementCountKey],
  }
}
