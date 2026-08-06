import { formatAdminDateTime } from '@/lib/admin/format-datetime'

export function bullet(label: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined || value === '' ? '—' : String(value)
  return `- ${label}: ${v}`
}

export function formatExportDate(iso: string | null | undefined): string {
  return formatAdminDateTime(iso)
}

export type ChunkQaExport = {
  status: string | null
  validated_at: string | null
  refinement_count: number
  validation_attempt_count: number
  active_claim_version_id: string | null
  claim_version_lineage: unknown[]
  review_report: unknown | null
  validation_status: unknown | null
  standardization_report: unknown | null
}

type ChunkQaSource = {
  active_claim_version_id?: string | null
  claim_version_lineage?: unknown[]
  extraction_qa_status?: string | null
  extraction_qa_validated_at?: string | null
  extraction_qa_refinement_count?: number | null
  extraction_qa_validation_attempt_count?: number | null
  extraction_qa_review_report?: unknown
  extraction_qa_validation_report?: unknown
  extraction_qa_standardization_report?: unknown
}

export function formatChunkQa(source: ChunkQaSource): ChunkQaExport {
  return {
    status: source.extraction_qa_status ?? null,
    validated_at: source.extraction_qa_validated_at ?? null,
    refinement_count: Number(source.extraction_qa_refinement_count ?? 0),
    validation_attempt_count: Number(source.extraction_qa_validation_attempt_count ?? 0),
    active_claim_version_id: source.active_claim_version_id ?? null,
    claim_version_lineage: source.claim_version_lineage ?? [],
    review_report: source.extraction_qa_review_report ?? null,
    validation_status: source.extraction_qa_validation_report ?? null,
    standardization_report: source.extraction_qa_standardization_report ?? null,
  }
}

export function appendChunkQaMarkdown(lines: string[], qa: ChunkQaExport, title = 'Chunk QA'): void {
  lines.push(`## ${title}`, '')
  lines.push(bullet('Status', qa.status))
  lines.push(bullet('Validated at', formatExportDate(qa.validated_at)))
  lines.push(bullet('Refinement count', qa.refinement_count))
  lines.push('')
}
