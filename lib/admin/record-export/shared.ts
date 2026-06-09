export function bullet(label: string, value: string | number | null | undefined): string {
  const v = value === null || value === undefined || value === '' ? '—' : String(value)
  return `- ${label}: ${v}`
}

export function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export type ChunkQaExport = {
  status: string | null
  validated_at: string | null
  refinement_count: number
  validation_attempt_count: number
  review_report: unknown | null
  validation_status: unknown | null
  standardization_report: unknown | null
}

type ChunkQaSource = {
  extraction_qa_status?: string | null
  extraction_qa_validated_at?: string | null
  extraction_qa_refinement_count?: number | null
  extraction_qa_validation_attempt_count?: number | null
  extraction_qa_review_report?: unknown | null
  extraction_qa_validation_report?: unknown | null
  extraction_qa_standardization_report?: unknown | null
}

export function formatChunkQa(chunk: ChunkQaSource): ChunkQaExport {
  return {
    status: chunk.extraction_qa_status ?? null,
    validated_at: chunk.extraction_qa_validated_at ?? null,
    refinement_count: chunk.extraction_qa_refinement_count ?? 0,
    validation_attempt_count: chunk.extraction_qa_validation_attempt_count ?? 0,
    review_report: chunk.extraction_qa_review_report ?? null,
    validation_status: chunk.extraction_qa_validation_report ?? null,
    standardization_report: chunk.extraction_qa_standardization_report ?? null,
  }
}

export function appendChunkQaMarkdown(lines: string[], qa: ChunkQaExport) {
  lines.push('## Chunk QA', '')
  lines.push(bullet('Status', qa.status))
  lines.push(bullet('Validated at', formatExportDate(qa.validated_at)))
  lines.push(bullet('Refinement cycles', qa.refinement_count))
  lines.push(bullet('Validation attempts', qa.validation_attempt_count))
  lines.push('')
  lines.push('### Review report (LLM)', '')
  if (qa.review_report) {
    lines.push('```json')
    lines.push(JSON.stringify(qa.review_report, null, 2))
    lines.push('```')
  } else {
    lines.push('(no review report)')
  }
  lines.push('')
  if (qa.validation_status) {
    lines.push('### Validation status (pipeline summary)', '')
    lines.push('```json')
    lines.push(JSON.stringify(qa.validation_status, null, 2))
    lines.push('```')
    lines.push('')
  }
}
