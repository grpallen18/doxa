import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

export type QaLaneId = 'claims' | 'positions'

type LaneStepIds = {
  validateStep: string
  refineStep: string
  approveStep: string
  extractStep: string
}

export const QA_LANE_ARTIFACT_STAGES: Record<
  QaLaneId,
  LaneStepIds & {
    review: readonly string[]
    refine: readonly string[]
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
    approve: ['chunk_approve_claims'],
    validateStep: 'validate-chunk-claims',
    refineStep: 'refine-chunk-claims',
    approveStep: 'approve-chunk-claims',
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
    approve: [],
    validateStep: 'validate-chunk-positions',
    refineStep: 'refine-chunk-positions',
    approveStep: 'validate-chunk-positions',
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
  'approve-chunk-claims': QA_LANE_ARTIFACT_STAGES.claims.approve,
}
