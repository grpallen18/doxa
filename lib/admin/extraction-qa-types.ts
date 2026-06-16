export type ExtractionQaStatus =
  | 'pending'
  | 'reviewed'
  | 'standardized'
  | 'needs_refinement'
  | 'refined'
  | 'awaiting_approval'
  | 'atoms_passed'
  | 'passed'
  | 'needs_human_review'
  | null

export const EXTRACTION_ISSUE_TYPES = [
  'missing_claim',
  'unsupported_claim',
  'hallucinated_date',
  'bad_event_granularity',
  'missing_position',
  'weak_evidence_link',
  'duplicate_extraction',
  'merge_drift',
  'bad_link',
] as const

export type ExtractionIssueType = (typeof EXTRACTION_ISSUE_TYPES)[number]

export function qaStatusLabel(status: ExtractionQaStatus): string {
  if (!status) return '—'
  switch (status) {
    case 'pending':
      return 'QA pending'
    case 'reviewed':
      return 'Reviewed'
    case 'standardized':
      return 'Standardized'
    case 'needs_refinement':
      return 'Needs refinement'
    case 'refined':
      return 'Refined'
    case 'awaiting_approval':
      return 'Awaiting approval'
    case 'atoms_passed':
      return 'Atoms validated'
    case 'passed':
      return 'QA passed'
    case 'needs_human_review':
      return 'Needs human review'
    default:
      return status
  }
}
