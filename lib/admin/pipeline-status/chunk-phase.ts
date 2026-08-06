import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

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

/** Claims chunk QA removed — always not_started. */
export function deriveChunkLanePhase(
  _lane: string,
  _chunk: ChunkRow
): ChunkLanePhase {
  return 'not_started'
}

export function chunkLanePhaseLabel(_lane: string, _chunk: ChunkRow): string {
  return CHUNK_LANE_PHASE_LABELS.not_started
}

export function chunkNeedsAction(_lane: string, _chunk: ChunkRow): boolean {
  return false
}

export function laneForChunkStep(_stepId: string): string | null {
  return null
}
