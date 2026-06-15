import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  CHUNK_LANE_PHASE_LABELS,
  deriveChunkLanePhase,
} from '@/lib/admin/pipeline-status/chunk-phase'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'

function laneForStep(stepId: PipelineStepId): QaLaneId | null {
  if (stepId === 'extract-story-claims' || stepId === 'validate-chunk-claims') {
    return 'claims'
  }
  return null
}

function countPhases(lane: QaLaneId, payload: StoryExtractionReviewPayload) {
  const counts: Record<string, number> = {}
  for (const chunk of payload.chunks) {
    if (chunk.content == null || chunk.content.length === 0) continue
    const phase = deriveChunkLanePhase(lane, chunk)
    counts[phase] = (counts[phase] ?? 0) + 1
  }
  return counts
}

/** Story-layer rollup for chunk-parallel nodes (read-only on story canvas). */
export function chunkParallelStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  const lane = laneForStep(stepId)
  if (!lane) return null

  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const withBody = payload.chunks.filter((c) => c.content != null && c.content.length > 0)
  const total = withBody.length
  if (total === 0) return 'No chunks yet'

  const counts = countPhases(lane, payload)
  const complete = counts.complete ?? 0

  if (stepId === stages.extractStep) {
    const extracted = withBody.filter((c) => c[stages.extractionJsonKey] != null).length
    return `${extracted}/${total} extracted`
  }

  const parts: string[] = [`${complete}/${total} complete`]
  const awaitingReview = counts.awaiting_review ?? 0
  const awaitingRefine = counts.awaiting_refine ?? 0
  const needsHuman = counts.needs_human ?? 0
  const notStarted = counts.not_started ?? 0

  if (awaitingReview > 0) parts.push(`${awaitingReview} ${CHUNK_LANE_PHASE_LABELS.awaiting_review.toLowerCase()}`)
  if (awaitingRefine > 0) parts.push(`${awaitingRefine} ${CHUNK_LANE_PHASE_LABELS.awaiting_refine.toLowerCase()}`)
  if (needsHuman > 0) parts.push(`${needsHuman} ${CHUNK_LANE_PHASE_LABELS.needs_human.toLowerCase()}`)
  if (notStarted > 0 && stepId === stages.extractStep) {
    parts.push(`${notStarted} not started`)
  }

  return parts.join(' · ')
}
