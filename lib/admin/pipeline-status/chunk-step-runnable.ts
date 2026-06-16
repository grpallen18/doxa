import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { mergeEligibilitySnapshot } from '@/lib/admin/claims-merge-eligibility'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  deriveChunkLanePhase,
  laneForChunkStep,
  type ChunkLanePhase,
  type ChunkRow,
} from '@/lib/admin/pipeline-status/chunk-phase'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'

function laneForStep(stepId: PipelineStepId): QaLaneId | null {
  return laneForChunkStep(stepId)
}

function chunkHasBody(chunk: ChunkRow): boolean {
  return chunk.content != null && chunk.content.length > 0
}

function claimsStages() {
  return QA_LANE_ARTIFACT_STAGES.claims
}

/** Whether a single chunk/lane step can run next (chunk-layer agent flow). */
export function isChunkStepRunnable(
  stepId: PipelineStepId,
  chunk: ChunkRow,
  _payload: StoryExtractionReviewPayload
): boolean {
  const lane = laneForStep(stepId)
  if (lane !== 'claims') return false

  const stages = claimsStages()
  const phase = deriveChunkLanePhase(lane, chunk)

  if (stepId === stages.extractStep) {
    return chunkHasBody(chunk) && phase === 'not_started'
  }

  if (stepId === stages.validateStep) {
    if (chunk[stages.extractionJsonKey] == null) return false
    return phase === 'awaiting_review'
  }

  if (stepId === stages.refineStep) {
    if (chunk[stages.extractionJsonKey] == null) return false
    return phase === 'awaiting_refine'
  }

  if (stepId === stages.approveStep) {
    if (chunk[stages.extractionJsonKey] == null) return false
    return phase === 'awaiting_approval'
  }

  return false
}

function refineStepComplete(phase: ChunkLanePhase): boolean {
  return (
    phase === 'awaiting_approval' ||
    phase === 'complete' ||
    phase === 'needs_human'
  )
}

/** Whether a chunk-layer step has no further work for this chunk (chunk canvas display). */
export function isChunkStepDomainComplete(
  stepId: PipelineStepId,
  chunk: ChunkRow
): boolean {
  const lane = laneForStep(stepId)
  if (lane !== 'claims') return false

  const phase = deriveChunkLanePhase(lane, chunk)
  const stages = claimsStages()

  if (stepId === stages.extractStep) {
    return phase !== 'not_started'
  }

  if (stepId === stages.validateStep) {
    return phase !== 'not_started' && phase !== 'awaiting_review'
  }

  if (stepId === stages.refineStep) {
    return refineStepComplete(phase)
  }

  if (stepId === stages.approveStep) {
    return phase === 'complete'
  }

  return false
}

export function chunkStepProgressLabel(
  stepId: PipelineStepId,
  chunk: ChunkRow
): string | null {
  const lane = laneForStep(stepId)
  if (lane !== 'claims') return null

  const phase = deriveChunkLanePhase(lane, chunk)
  const stages = claimsStages()

  if (stepId === stages.extractStep) {
    return phase === 'not_started' ? 'Not extracted' : 'Extracted'
  }

  if (stepId === stages.validateStep) {
    if (phase === 'awaiting_review') return 'Awaiting review'
    if (phase === 'complete') return 'Merge-ready'
    if (phase === 'needs_human') return 'Needs human'
    if (phase === 'awaiting_refine') return 'Review done — refine next'
    if (phase === 'awaiting_approval') return 'Review done'
    return 'Not ready'
  }

  if (stepId === stages.refineStep) {
    if (phase === 'awaiting_refine') return 'Awaiting refine'
    if (phase === 'awaiting_approval') return 'Refined — approval next'
    if (phase === 'complete') return 'Skipped (fast path)'
    if (phase === 'needs_human') return 'Refine exhausted'
    return 'Not ready'
  }

  if (stepId === stages.approveStep) {
    if (phase === 'awaiting_approval') return 'Awaiting approval'
    if (phase === 'complete') return 'Merge-ready'
    if (phase === 'awaiting_refine') return 'Approval sent back to refine'
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
  if (lane !== 'claims') return { stepId, chunkIndex }

  const stages = claimsStages()
  const merge = mergeEligibilitySnapshot(chunk.claims_merge_eligibility)

  return {
    stepId,
    chunkIndex,
    phase: deriveChunkLanePhase(lane, chunk),
    extraction_json: chunk[stages.extractionJsonKey],
    qa_status: chunk[stages.qaStatusKey],
    refinement_count: chunk[stages.refinementCountKey],
    parked_count: merge.parked_count,
    repair_queue_ids: merge.repair_queue_ids,
    pending_approval_ids: merge.pending_approval_ids,
    rejected_final_count: merge.rejected_final_count,
  }
}
