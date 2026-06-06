import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'

export function chunkQaCounts(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
  const total = chunks.length
  const extracted = chunks.filter((c) => c.extraction_json != null)
  const withJson = extracted.length
  const pendingValidate = extracted.filter(
    (c) => c.extraction_qa_status === 'pending' || c.extraction_qa_status == null
  ).length
  const passed = extracted.filter((c) => c.extraction_qa_status === 'passed').length
  const needsHuman = extracted.filter((c) => c.extraction_qa_status === 'needs_human_review').length
  return { total, withJson, pendingValidate, passed, needsHuman }
}

function isExtractComplete(payload: StoryExtractionReviewPayload): boolean {
  const { total, withJson } = chunkQaCounts(payload)
  return total > 0 && withJson === total
}

export function isMergeValidated(payload: StoryExtractionReviewPayload): boolean {
  const qa = payload.story.extraction_qa_status
  return qa === 'passed' || qa === 'needs_human_review'
}

function isChunkQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.chunks.some((c) => c.extraction_qa_status === 'needs_human_review')
}

function isMergeQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.extraction_qa_status === 'needs_human_review'
}

export function isExtractionPipelineBlocked(payload: StoryExtractionReviewPayload): boolean {
  return isChunkQaBlocked(payload) || isMergeQaBlocked(payload)
}

export function getExtractionBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (isChunkQaBlocked(payload)) return 'Chunk claims validation needs human review'
  if (isMergeQaBlocked(payload)) return 'Merged extraction QA needs human review'
  return null
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
    case 'validate-chunk-claims':
      return isExtractComplete(payload) && counts.withJson > 0 && counts.passed === counts.withJson
    case 'merge-story-claims':
      return payload.story.merged_at != null
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
  if (stepId === 'validate-merged-extraction' && isMergeQaBlocked(payload)) return true
  return false
}

export function extractionStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  const c = chunkQaCounts(payload)
  switch (stepId) {
    case 'extract-story-claims':
      return c.total > 0 ? `${c.withJson}/${c.total} chunks extracted` : null
    case 'validate-chunk-claims':
      return c.withJson > 0 ? `${c.passed}/${c.withJson} chunks passed` : null
    default:
      return null
  }
}

export function isRefineOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
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
  if (!isExtractionStepComplete(stepId, payload)) return null

  switch (stepId) {
    case 'refine-merged-extraction': {
      const hasRefineOutput =
        (payload.story.extraction_qa_refinement_count ?? 0) > 0 ||
        payload.qa_artifacts.some((a) => a.stage === 'merge_refine')
      if (!hasRefineOutput && isRefineOptional(stepId, payload)) {
        return 'No merge refinement necessary — stage completed.'
      }
      return null
    }
    default:
      return null
  }
}

export function canRunExtractionWhenBlocked(stepId: PipelineStepId): boolean {
  return (
    stepId === 'validate-chunk-claims' ||
    stepId === 'validate-merged-extraction' ||
    stepId === 'review-merged-extraction' ||
    stepId === 'refine-merged-extraction'
  )
}

export function extractionSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  const c = chunkQaCounts(payload)
  const extracted = payload.chunks
    .filter((ch) => ch.extraction_json != null)
    .map((ch) => ({
      chunk_index: ch.chunk_index,
      qa_status: ch.extraction_qa_status,
      refinement_count: ch.extraction_qa_refinement_count ?? 0,
      has_validation: ch.extraction_qa_validation_report != null,
    }))
  return {
    stepId,
    chunks: c,
    extracted,
    merged_at: payload.story.merged_at,
    qa: payload.story.extraction_qa_status,
    refinement_count: payload.story.extraction_qa_refinement_count ?? 0,
    has_merge_review: payload.story.extraction_qa_review_report != null,
    has_merge_validation: payload.story.extraction_qa_validation_report != null,
  }
}
