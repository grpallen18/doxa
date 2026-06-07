import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { PIPELINE_STEPS } from '@/lib/admin/generated/pipeline-catalog'

type TimelineStepStatus = 'complete' | 'current' | 'pending' | 'blocked'

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
    case 'validate-chunk-claims':
      return isChunkReviewApproved(payload)
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
  if (stepId === 'merge-story-claims' && !isChunkReviewApproved(payload) && isExtractComplete(payload)) {
    return isChunkQaBlocked(payload)
  }
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
    case 'merge-story-claims':
      if (!isChunkReviewApproved(payload) && isExtractComplete(payload)) {
        return 'Requires all chunks passed before merge'
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
