import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  MAX_CHUNK_QA_REFINEMENT_ATTEMPTS,
  MAX_CHUNK_QA_VALIDATION_ATTEMPTS,
} from '@/lib/admin/pipeline-status/qa-lane-state'
import { QA_LANE_ARTIFACT_STAGES, type QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'

export type ChunkLanePhase =
  | 'not_started'
  | 'awaiting_review'
  | 'awaiting_refine'
  | 'awaiting_approval'
  | 'needs_human'
  | 'complete'

export type ChunkRow = StoryExtractionReviewPayload['chunks'][number]

export const CHUNK_LANE_PHASE_LABELS: Record<ChunkLanePhase, string> = {
  not_started: 'Not started',
  awaiting_review: 'Awaiting review',
  awaiting_refine: 'Awaiting refine',
  awaiting_approval: 'Awaiting approval',
  needs_human: 'Needs human',
  complete: 'Complete',
}

function isUnderAttemptCaps(lane: QaLaneId, chunk: ChunkRow): boolean {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  const refinementCount = chunk[stages.refinementCountKey] ?? 0
  const validationAttempts = chunk[stages.validationAttemptCountKey] ?? 0
  return (
    refinementCount < MAX_CHUNK_QA_REFINEMENT_ATTEMPTS &&
    validationAttempts < MAX_CHUNK_QA_VALIDATION_ATTEMPTS
  )
}

/** Single source of truth for what happens next on a chunk in one QA lane. */
export function deriveChunkLanePhase(lane: QaLaneId, chunk: ChunkRow): ChunkLanePhase {
  const stages = QA_LANE_ARTIFACT_STAGES[lane]
  if (chunk[stages.extractionJsonKey] == null) return 'not_started'

  const status = chunk[stages.qaStatusKey]
  if (status === 'passed' || status === 'atoms_passed') return 'complete'

  if (status === 'needs_refinement' && isUnderAttemptCaps(lane, chunk)) {
    return 'awaiting_refine'
  }

  if (status === 'awaiting_approval') {
    return 'awaiting_approval'
  }

  if (status === 'needs_human_review') {
    return 'needs_human'
  }

  if (status == null || status === 'pending') {
    return 'awaiting_review'
  }

  if (status === 'needs_refinement' && !isUnderAttemptCaps(lane, chunk)) {
    return 'needs_human'
  }

  return 'needs_human'
}

export function chunkLanePhaseLabel(lane: QaLaneId, chunk: ChunkRow): string {
  return CHUNK_LANE_PHASE_LABELS[deriveChunkLanePhase(lane, chunk)]
}

export function chunkNeedsAction(lane: QaLaneId, chunk: ChunkRow): boolean {
  const phase = deriveChunkLanePhase(lane, chunk)
  return (
    phase === 'awaiting_review' ||
    phase === 'awaiting_refine' ||
    phase === 'awaiting_approval' ||
    phase === 'needs_human'
  )
}

export function laneForChunkStep(stepId: string): QaLaneId | null {
  if (stepId.startsWith('extract-story-claims') || stepId.includes('chunk-claims')) return 'claims'
  if (stepId.startsWith('extract-story-positions') || stepId.includes('chunk-positions')) {
    return 'positions'
  }
  return null
}
