import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type QaLaneId = 'claims' | 'positions'

export const QA_LANE_ARTIFACT_STAGES: Record<
  QaLaneId,
  {
    review: readonly string[]
    refine: readonly string[]
    validateStep: PipelineStepId
    refineStep: PipelineStepId
    extractStep: PipelineStepId
    refinementCountKey: 'extraction_qa_refinement_count' | 'positions_qa_refinement_count'
    validationAttemptCountKey:
      | 'extraction_qa_validation_attempt_count'
      | 'positions_qa_validation_attempt_count'
    reviewReportKey: 'extraction_qa_review_report' | 'positions_qa_review_report'
    extractionJsonKey: 'extraction_json' | 'positions_extraction_json'
    qaStatusKey: 'extraction_qa_status' | 'positions_qa_status'
  }
> = {
  claims: {
    review: ['chunk_review_claims', 'chunk_review', 'chunk_validate'],
    refine: ['chunk_refine_claims', 'chunk_refine'],
    validateStep: 'validate-chunk-claims',
    refineStep: 'refine-chunk-claims',
    extractStep: 'extract-story-claims',
    refinementCountKey: 'extraction_qa_refinement_count',
    validationAttemptCountKey: 'extraction_qa_validation_attempt_count',
    reviewReportKey: 'extraction_qa_review_report',
    extractionJsonKey: 'extraction_json',
    qaStatusKey: 'extraction_qa_status',
  },
  positions: {
    review: ['chunk_review_positions'],
    refine: ['chunk_refine_positions'],
    validateStep: 'validate-chunk-positions',
    refineStep: 'refine-chunk-positions',
    extractStep: 'extract-story-positions',
    refinementCountKey: 'positions_qa_refinement_count',
    validationAttemptCountKey: 'positions_qa_validation_attempt_count',
    reviewReportKey: 'positions_qa_review_report',
    extractionJsonKey: 'positions_extraction_json',
    qaStatusKey: 'positions_qa_status',
  },
}

export const STEP_QA_ARTIFACT_STAGES: Partial<Record<PipelineStepId, readonly string[]>> = {
  'extract-story-claims': ['chunk_extract_claims', 'chunk_extract'],
  'validate-chunk-claims': QA_LANE_ARTIFACT_STAGES.claims.review,
  'refine-chunk-claims': QA_LANE_ARTIFACT_STAGES.claims.refine,
  'extract-story-positions': ['chunk_extract_positions'],
  'validate-chunk-positions': QA_LANE_ARTIFACT_STAGES.positions.review,
  'refine-chunk-positions': QA_LANE_ARTIFACT_STAGES.positions.refine,
  'review-merged-extraction': ['merge_review'],
  'refine-merged-extraction': ['merge_refine'],
  'validate-merged-extraction': ['merge_validate'],
}
