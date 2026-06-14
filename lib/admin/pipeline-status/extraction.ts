import { countPositionsInExtractionJson } from '@/lib/admin/chunk-extraction'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { ExtractionLaneId } from '@/lib/admin/pipeline-status/extraction-groups'
import type { ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'
import { formatChunksCreatedLabel } from '@/lib/admin/pipeline-step-run-display'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'

type TimelineStepStatus = 'complete' | 'current' | 'pending' | 'blocked'

function isChunkClaimsValidatedStatus(status: ExtractionQaStatus): boolean {
  return status === 'passed' || status === 'atoms_passed'
}

type ChunkQaRow = Pick<
  StoryExtractionReviewPayload['chunks'][number],
  'extraction_json' | 'extraction_qa_status'
> & {
  extraction_qa_refinement_count?: number | null
  extraction_qa_validation_attempt_count?: number | null
  extraction_qa_review_report?: unknown | null
}

type PositionsChunkQaRow = Pick<
  StoryExtractionReviewPayload['chunks'][number],
  'positions_extraction_json' | 'positions_qa_status'
> & {
  positions_qa_refinement_count?: number | null
  positions_qa_validation_attempt_count?: number | null
  positions_qa_review_report?: unknown | null
}

/** Review step has run for this chunk (no longer waiting for first review). */
export function isChunkClaimsReviewDone(chunk: ChunkQaRow): boolean {
  if (chunk.extraction_json == null) return false
  const status = chunk.extraction_qa_status
  if (status == null || status === 'pending') return false
  return true
}

/** Refine step is done or was not required for this chunk (not waiting on refinement). */
export function isChunkClaimsRefineDone(chunk: ChunkQaRow): boolean {
  if (chunk.extraction_json == null) return false
  const status = chunk.extraction_qa_status
  if (status === 'needs_refinement') return false
  if (status == null || status === 'pending') {
    return (chunk.extraction_qa_refinement_count ?? 0) > 0
  }
  return true
}

/** Both review and refine stages are complete for this chunk. */
export function isChunkClaimsQaComplete(chunk: ChunkQaRow): boolean {
  return isChunkClaimsReviewDone(chunk) && isChunkClaimsRefineDone(chunk)
}

export function chunkQaCounts(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
  const total = chunks.length
  const extracted = chunks.filter((c) => c.extraction_json != null)
  const withJson = extracted.length
  const pendingValidate = extracted.filter(
    (c) => c.extraction_qa_status === 'pending' || c.extraction_qa_status == null
  ).length
  const validated = extracted.filter((c) =>
    isChunkClaimsValidatedStatus(c.extraction_qa_status)
  ).length
  const passed = extracted.filter((c) => c.extraction_qa_status === 'passed').length
  const needsHuman = extracted.filter((c) => c.extraction_qa_status === 'needs_human_review').length
  const needsRefinement = extracted.filter((c) => c.extraction_qa_status === 'needs_refinement').length
  return { total, withJson, pendingValidate, validated, passed, needsHuman, needsRefinement }
}

export function positionsChunkQaCounts(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
  const total = chunks.length
  const extracted = chunks.filter((c) => c.positions_extraction_json != null)
  const withJson = extracted.length
  const pendingValidate = extracted.filter(
    (c) => c.positions_qa_status === 'pending' || c.positions_qa_status == null
  ).length
  const validated = extracted.filter((c) =>
    isChunkClaimsValidatedStatus(c.positions_qa_status)
  ).length
  const passed = extracted.filter((c) => c.positions_qa_status === 'passed').length
  const needsHuman = extracted.filter((c) => c.positions_qa_status === 'needs_human_review').length
  const needsRefinement = extracted.filter((c) => c.positions_qa_status === 'needs_refinement').length
  return { total, withJson, pendingValidate, validated, passed, needsHuman, needsRefinement }
}

function isPositionsExtractComplete(payload: StoryExtractionReviewPayload): boolean {
  const { total, withJson } = positionsChunkQaCounts(payload)
  return total > 0 && withJson === total
}

function chunkHasPositionsReviewProgress(chunk: PositionsChunkQaRow): boolean {
  if (chunk.positions_extraction_json == null) return false
  const status = chunk.positions_qa_status
  if (status != null && status !== 'pending') return true
  return (
    (chunk.positions_qa_refinement_count ?? 0) > 0 ||
    (chunk.positions_qa_validation_attempt_count ?? 0) > 0 ||
    chunk.positions_qa_review_report != null
  )
}

export function isChunkPositionsReviewStarted(payload: StoryExtractionReviewPayload): boolean {
  const counts = positionsChunkQaCounts(payload)
  if (!isPositionsExtractComplete(payload) || counts.withJson === 0) return false
  if (counts.pendingValidate < counts.withJson) return true
  return payload.chunks.some(chunkHasPositionsReviewProgress)
}

export function isChunkPositionsReviewComplete(payload: StoryExtractionReviewPayload): boolean {
  if (!isPositionsExtractComplete(payload)) return false
  const extracted = payload.chunks.filter((c) => c.positions_extraction_json != null)
  if (extracted.length === 0) return false
  return !extracted.some(
    (c) =>
      c.positions_qa_status == null ||
      c.positions_qa_status === 'pending' ||
      c.positions_qa_status === 'needs_human_review'
  )
}

export function isChunkPositionsRefineDone(chunk: PositionsChunkQaRow): boolean {
  if (chunk.positions_extraction_json == null) return false
  const status = chunk.positions_qa_status
  if (status === 'needs_refinement') return false
  if (status == null || status === 'pending') {
    return (chunk.positions_qa_refinement_count ?? 0) > 0
  }
  return true
}

export function isChunkPositionsRefineSatisfied(payload: StoryExtractionReviewPayload): boolean {
  if (!isPositionsExtractComplete(payload)) return false
  const extracted = payload.chunks.filter((c) => c.positions_extraction_json != null)
  return extracted.every(isChunkPositionsRefineDone)
}

export function isChunkPositionsReviewApproved(payload: StoryExtractionReviewPayload): boolean {
  const counts = positionsChunkQaCounts(payload)
  return isPositionsExtractComplete(payload) && counts.withJson > 0 && counts.passed === counts.withJson
}

export function isPositionsLaneStarted(payload: StoryExtractionReviewPayload): boolean {
  return (
    payload.positions.length > 0 ||
    payload.chunks.some((chunk) => chunk.positions_extraction_json != null)
  )
}

function isExtractComplete(payload: StoryExtractionReviewPayload): boolean {
  const { total, withJson } = chunkQaCounts(payload)
  return total > 0 && withJson === total
}

function chunkHasClaimsReviewProgress(chunk: ChunkQaRow): boolean {
  if (chunk.extraction_json == null) return false
  const status = chunk.extraction_qa_status
  if (status != null && status !== 'pending') return true
  return (
    (chunk.extraction_qa_refinement_count ?? 0) > 0 ||
    (chunk.extraction_qa_validation_attempt_count ?? 0) > 0 ||
    chunk.extraction_qa_review_report != null
  )
}

/** At least one extracted chunk has been reviewed (QA status moved past pending). */
export function isChunkClaimsReviewStarted(payload: StoryExtractionReviewPayload): boolean {
  const counts = chunkQaCounts(payload)
  if (!isExtractComplete(payload) || counts.withJson === 0) return false
  if (counts.pendingValidate < counts.withJson) return true
  return payload.chunks.some(chunkHasClaimsReviewProgress)
}

/** Refine satisfied: review has run and no chunk is waiting on refinement. */
export function isChunkClaimsRefineSatisfied(payload: StoryExtractionReviewPayload): boolean {
  if (!isExtractComplete(payload)) return false
  const extracted = payload.chunks.filter((c) => c.extraction_json != null)
  return extracted.every(isChunkClaimsRefineDone)
}

/** Review chunk claims done for this story — every extracted chunk has been reviewed at least once. */
export function isChunkClaimsReviewComplete(payload: StoryExtractionReviewPayload): boolean {
  if (!isExtractComplete(payload)) return false
  const extracted = payload.chunks.filter((c) => c.extraction_json != null)
  if (extracted.length === 0) return false
  return !extracted.some(
    (c) =>
      c.extraction_qa_status == null ||
      c.extraction_qa_status === 'pending' ||
      c.extraction_qa_status === 'needs_human_review'
  )
}

/** All chunks at passed — merge-ready after link step. */
export function isChunkReviewApproved(payload: StoryExtractionReviewPayload): boolean {
  const counts = chunkQaCounts(payload)
  return isExtractComplete(payload) && counts.withJson > 0 && counts.passed === counts.withJson
}

export function isMergeValidated(payload: StoryExtractionReviewPayload): boolean {
  const qa = payload.story.extraction_qa_status
  return qa === 'passed' || qa === 'needs_human_review'
}

export function isExtractionStageComplete(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.extraction_qa_status === 'passed'
}

function isChunkQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.chunks.some((c) => c.extraction_qa_status === 'needs_human_review')
}

function isPositionsChunkQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.chunks.some((c) => c.positions_qa_status === 'needs_human_review')
}

function isMergeQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.extraction_qa_status === 'needs_human_review'
}

export function isExtractionPipelineBlocked(payload: StoryExtractionReviewPayload): boolean {
  return isChunkQaBlocked(payload) || isMergeQaBlocked(payload)
}

/** Parallel lanes: claims QA must not block positions steps (and vice versa). */
export function isExtractionLanePipelineBlocked(
  laneId: ExtractionLaneId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (laneId === 'positions') {
    return isPositionsChunkQaBlocked(payload) || isMergeQaBlocked(payload)
  }
  if (laneId === 'claims' || laneId === 'merge-qa') {
    return isChunkQaBlocked(payload) || isMergeQaBlocked(payload)
  }
  return isExtractionPipelineBlocked(payload)
}

export function getExtractionBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (isChunkQaBlocked(payload)) return 'Chunk claims validation needs human review'
  if (isMergeQaBlocked(payload)) return 'Merged extraction QA needs human review'
  return null
}

export function getExtractTimelineStatus(payload: StoryExtractionReviewPayload): TimelineStepStatus {
  const counts = chunkQaCounts(payload)
  if (counts.total === 0) return 'pending'
  if (counts.needsHuman > 0) return 'blocked'
  if (isChunkReviewApproved(payload)) return 'complete'
  return 'current'
}

export function getMergeTimelineStatus(payload: StoryExtractionReviewPayload): TimelineStepStatus {
  if (!isChunkReviewApproved(payload)) return 'pending'
  if (payload.story.extraction_qa_status === 'needs_human_review') return 'blocked'
  if (payload.story.extraction_qa_status === 'passed') return 'complete'
  return 'current'
}

export function extractTimelineDetail(payload: StoryExtractionReviewPayload): string {
  const base = 'Extract atomic entities from chunks'
  const counts = chunkQaCounts(payload)
  if (counts.needsHuman > 0) {
    return `${base}. Review required on one or more chunks.`
  }
  return base
}

export function mergeTimelineDetail(payload: StoryExtractionReviewPayload): string {
  const base = 'Combine and finalize extracted entities'
  const qa = payload.story.extraction_qa_status
  if (!isChunkReviewApproved(payload)) return base
  if (payload.story.merged_at == null) return base
  if (qa === 'passed') return base
  if (qa === 'needs_human_review') {
    return `${base}. Approve — human review required before canonicalization.`
  }
  if (qa) {
    return `${base}. Approve — ${qa.replace(/_/g, ' ')}.`
  }
  return `${base}. Approve merged extraction.`
}

export function isExtractionStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const qa = payload.story.extraction_qa_status
  const counts = chunkQaCounts(payload)

  switch (stepId) {
    case 'chunk-story-bodies':
      return counts.total > 0
    case 'extract-story-claims':
      return isExtractComplete(payload)
    case 'extract-story-positions':
      return isPositionsExtractComplete(payload)
    case 'validate-chunk-claims':
      return isChunkClaimsReviewComplete(payload)
    case 'validate-chunk-positions':
      return isChunkPositionsReviewComplete(payload)
    case 'refine-chunk-claims':
      return isChunkClaimsRefineSatisfied(payload)
    case 'refine-chunk-positions':
      return isChunkPositionsRefineSatisfied(payload)
    case 'merge-story-claims':
      return payload.story.merged_at != null
    case 'merge-story-positions':
      return payload.positions.length > 0
    case 'review-merged-extraction':
      return payload.story.merged_at != null && qa != null && qa !== 'pending'
    case 'refine-merged-extraction':
      return (
        isExtractionStepComplete('review-merged-extraction', payload) && qa !== 'needs_refinement'
      )
    case 'validate-merged-extraction':
      return isMergeValidated(payload)
    default:
      return false
  }
}

export function isExtractionStepBlocked(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (stepId === 'validate-chunk-claims' && isChunkQaBlocked(payload)) return true
  if (stepId === 'validate-chunk-positions' && isPositionsChunkQaBlocked(payload)) return true
  if (stepId === 'validate-merged-extraction' && isMergeQaBlocked(payload)) return true
  if (stepId === 'merge-story-claims' && !isChunkReviewApproved(payload) && isExtractComplete(payload)) {
    return isChunkQaBlocked(payload)
  }
  if (stepId === 'merge-story-positions' && !isChunkPositionsReviewApproved(payload) && isPositionsExtractComplete(payload)) {
    return isPositionsChunkQaBlocked(payload)
  }
  return false
}

export function extractionStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  const c = chunkQaCounts(payload)
  switch (stepId) {
    case 'chunk-story-bodies':
      return c.total > 0 ? formatChunksCreatedLabel(c.total) : null
    case 'extract-story-claims':
      return c.total > 0 ? `${c.withJson}/${c.total} chunks extracted` : null
    case 'extract-story-positions': {
      const p = positionsChunkQaCounts(payload)
      return p.total > 0 ? `${p.withJson}/${p.total} chunks with positions` : null
    }
    case 'validate-chunk-claims': {
      const reviewed = c.withJson - c.pendingValidate
      return c.withJson > 0 ? `${reviewed}/${c.withJson} chunks reviewed` : null
    }
    case 'validate-chunk-positions': {
      const p = positionsChunkQaCounts(payload)
      const reviewed = p.withJson - p.pendingValidate
      return p.withJson > 0 ? `${reviewed}/${p.withJson} chunks reviewed` : null
    }
    case 'refine-chunk-claims':
      return c.needsRefinement > 0 ? `${c.needsRefinement} chunk(s) need refinement` : null
    case 'refine-chunk-positions': {
      const p = positionsChunkQaCounts(payload)
      if (p.needsRefinement > 0) {
        return `${p.needsRefinement} chunk(s) need positions refinement`
      }
      const atLimit = payload.chunks.filter(
        (c) =>
          c.positions_extraction_json != null &&
          c.positions_qa_status === 'needs_refinement' &&
          ((c.positions_qa_refinement_count ?? 0) >= 3 ||
            (c.positions_qa_validation_attempt_count ?? 0) >= 3)
      ).length
      return atLimit > 0 ? `${atLimit} chunk(s) hit refine/review attempt limit` : null
    }
    case 'merge-story-claims':
      if (!isChunkReviewApproved(payload) && isExtractComplete(payload)) {
        return 'Requires all chunks passed review before merge'
      }
      return null
    case 'merge-story-positions':
      if (!isChunkPositionsReviewApproved(payload) && isPositionsExtractComplete(payload)) {
        return 'Requires all chunks passed positions review before merge'
      }
      return null
    case 'review-merged-extraction':
    case 'refine-merged-extraction':
    case 'validate-merged-extraction':
      if (payload.story.merged_at == null) return 'Run merge first'
      return payload.story.extraction_qa_status
        ? `Merge QA: ${payload.story.extraction_qa_status.replace(/_/g, ' ')}`
        : null
    default:
      return null
  }
}

export function isRefineOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'refine-chunk-claims') {
    return isChunkClaimsRefineSatisfied(payload)
  }
  if (stepId === 'refine-chunk-positions') {
    return isChunkPositionsRefineSatisfied(payload)
  }
  if (stepId === 'refine-merged-extraction') {
    return (
      payload.story.extraction_qa_status !== 'needs_refinement' &&
      isExtractionStepComplete('review-merged-extraction', payload)
    )
  }
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (def?.optional) {
    return isExtractionStepComplete('validate-merged-extraction', payload)
  }
  return false
}

export function getExtractionNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (stepId === 'refine-chunk-claims' && isRefineOptional(stepId, payload)) {
    return 'Chunk review did not request refinement — this loop step is not required.'
  }
  if (stepId === 'refine-chunk-positions' && isRefineOptional(stepId, payload)) {
    return 'Positions review did not request refinement — this loop step is not required.'
  }
  if (stepId === 'refine-merged-extraction' && isRefineOptional(stepId, payload)) {
    return 'Merge review did not request refinement — this loop step is not required.'
  }
  if (!isExtractionStepComplete(stepId, payload)) return null

  switch (stepId) {
    case 'refine-merged-extraction': {
      const hasRefineOutput =
        (payload.story.extraction_qa_refinement_count ?? 0) > 0 ||
        payload.qa_artifacts.some((a) => a.stage === 'merge_refine')
      if (!hasRefineOutput && isRefineOptional(stepId, payload)) {
        return 'No merge refinement necessary — loop step completed.'
      }
      return null
    }
    default:
      return null
  }
}

export function canRunExtractionWhenBlocked(stepId: PipelineStepId): boolean {
  return (
    stepId === 'extract-story-claims' ||
    stepId === 'extract-story-positions' ||
    stepId === 'validate-chunk-claims' ||
    stepId === 'refine-chunk-claims' ||
    stepId === 'validate-chunk-positions' ||
    stepId === 'refine-chunk-positions' ||
    stepId === 'validate-merged-extraction' ||
    stepId === 'review-merged-extraction' ||
    stepId === 'refine-merged-extraction'
  )
}

export function extractionSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  const c = chunkQaCounts(payload)
  const p = positionsChunkQaCounts(payload)
  const claimsExtracted = payload.chunks
    .filter((ch) => ch.extraction_json != null)
    .map((ch) => ({
      chunk_index: ch.chunk_index,
      qa_status: ch.extraction_qa_status,
      refinement_count: ch.extraction_qa_refinement_count ?? 0,
      has_validation: ch.extraction_qa_validation_report != null,
    }))
  const positionsExtracted = payload.chunks
    .filter((ch) => ch.positions_extraction_json != null)
    .map((ch) => ({
      chunk_index: ch.chunk_index,
      qa_status: ch.positions_qa_status,
      refinement_count: ch.positions_qa_refinement_count ?? 0,
      has_validation: ch.positions_qa_validation_report != null,
    }))
  return {
    stepId,
    claims_chunks: c,
    claims_extracted: claimsExtracted,
    positions_chunks: p,
    positions_extracted: positionsExtracted,
    positions_count: payload.chunks.reduce(
      (sum, chunk) => sum + countPositionsInExtractionJson(chunk.positions_extraction_json),
      0
    ),
    merged_positions_count: payload.positions.length,
    merged_at: payload.story.merged_at,
    qa: payload.story.extraction_qa_status,
    refinement_count: payload.story.extraction_qa_refinement_count ?? 0,
    has_merge_review: payload.story.extraction_qa_review_report != null,
    has_merge_validation: payload.story.extraction_qa_validation_report != null,
  }
}
