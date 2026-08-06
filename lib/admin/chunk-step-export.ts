import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { QaLaneId } from '@/lib/admin/pipeline-status/qa-lane-stages'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

/** Stub — claim chunk step export removed with Neo path. */

export type ChunkAtomType = QaLaneId

export type ChunkStepOutcome =
  | 'passed'
  | 'complete'
  | 'needs_refinement'
  | 'needs_human_review'
  | 'failed_runtime'
  | null

export type ChunkStepNextAction =
  | 'run_review'
  | 'run_refiner'
  | 'run_approver'
  | 'merge_ready'
  | 'human_review'
  | 'stop_max_retries'
  | 'run_extract'
  | null

export const CHUNK_EXPORT_STEP_KEYS: Partial<Record<PipelineStepId, string>> = {}

export type ChunkReviewExport = Record<string, unknown>
export type ChunkRefinementExport = Record<string, unknown>

export function resolveChunkAtomType(_stepId: PipelineStepId): ChunkAtomType | null {
  return null
}

export function deriveChunkStepOutcome(
  _stepId: PipelineStepId,
  _chunk: StoryExtractionReviewPayload['chunks'][number]
): ChunkStepOutcome {
  return null
}

export function deriveChunkStepNextAction(
  _stepId: PipelineStepId,
  _chunk: StoryExtractionReviewPayload['chunks'][number]
): ChunkStepNextAction {
  return null
}

export function getChunkStepCompletedAt(
  _stepId: PipelineStepId,
  _chunk: StoryExtractionReviewPayload['chunks'][number],
  _payload: StoryExtractionReviewPayload
): string | null {
  return null
}

export function getChunkStepExportOutput(
  _stepId: PipelineStepId,
  _chunk: StoryExtractionReviewPayload['chunks'][number],
  _payload: StoryExtractionReviewPayload
): unknown {
  return null
}

export function assembleChunkLaneLifecycle(
  _lane: QaLaneId,
  _chunk: StoryExtractionReviewPayload['chunks'][number],
  _payload: StoryExtractionReviewPayload
): unknown {
  return { steps: [] }
}

export function checkChunkExportInvariants(_args: unknown): string[] {
  return []
}
