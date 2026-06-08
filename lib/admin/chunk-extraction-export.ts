import { flattenExtractionJson } from '@/lib/admin/chunk-extraction'
import type { ChunkRecord } from '@/lib/admin/chunk-record'

function bullet(label: string, value: unknown): string {
  const v = value === null || value === undefined || value === '' ? '—' : String(value)
  return `- ${label}: ${v}`
}

export function buildChunkExtractionExportPayload(record: ChunkRecord) {
  const extraction = record.extraction_json
    ? flattenExtractionJson(record.chunk_index, record.extraction_json)
    : { claims: [], evidence: [], positions: [], events: [] }

  return {
    chunk: {
      chunk_friendly_id: record.chunk_friendly_id,
      chunk_index: record.chunk_index,
      chunk_number: record.chunk_index + 1,
      chunk_count: record.chunk_count,
      content_length: record.content.length,
      qa_status: record.extraction_qa_status,
      validated_at: record.extraction_qa_validated_at,
      refinement_count: record.extraction_qa_refinement_count,
      validation_attempt_count: record.extraction_qa_validation_attempt_count,
    },
    story: {
      story_id: record.story_id,
      story_friendly_id: record.story_friendly_id,
      title: record.story_title,
      url: record.story_url,
    },
    content: record.content,
    extraction,
    extraction_json: record.extraction_json,
    qa_reports: {
      standardization: record.extraction_qa_standardization_report,
      validation: record.extraction_qa_validation_report,
    },
  }
}

export function buildChunkExtractionReviewJson(record: ChunkRecord): string {
  return JSON.stringify(buildChunkExtractionExportPayload(record), null, 2)
}

export function buildChunkExtractionReviewMarkdown(record: ChunkRecord): string {
  const payload = buildChunkExtractionExportPayload(record)
  const lines: string[] = []

  lines.push('# Chunk Extraction Review', '')
  lines.push('## Chunk Metadata')
  lines.push(bullet('Chunk ID', payload.chunk.chunk_friendly_id))
  lines.push(bullet('Chunk Number', payload.chunk.chunk_number))
  lines.push(bullet('Chunk Count', payload.chunk.chunk_count))
  lines.push(bullet('Content Length', payload.chunk.content_length))
  lines.push(bullet('QA Status', payload.chunk.qa_status))
  lines.push(bullet('Validated At', payload.chunk.validated_at))
  lines.push(bullet('Refinement Cycles', payload.chunk.refinement_count))
  lines.push(bullet('Validation Attempts', payload.chunk.validation_attempt_count))
  lines.push('')

  lines.push('## Story Metadata')
  lines.push(bullet('Story ID', payload.story.story_friendly_id ?? payload.story.story_id))
  lines.push(bullet('Title', payload.story.title))
  lines.push(bullet('URL', payload.story.url))
  lines.push('')

  lines.push('## Chunk Text', '')
  lines.push(payload.content || '(no chunk content available)')
  lines.push('')

  lines.push('## Extracted Claims', '')
  if (payload.extraction.claims.length === 0) {
    lines.push('(no claims extracted)')
  } else {
    payload.extraction.claims.forEach((claim, index) => {
      lines.push(`### Claim ${index + 1}`)
      lines.push(bullet('Text', claim.raw_text))
      lines.push(bullet('Polarity', claim.polarity))
      lines.push(bullet('Stance', claim.stance))
      lines.push(bullet('Confidence', claim.extraction_confidence))
      lines.push(bullet('Span Start', claim.span_start))
      lines.push(bullet('Span End', claim.span_end))
      lines.push(bullet('Source Excerpt', claim.source_excerpt))
      lines.push('')
    })
  }

  if (payload.extraction.evidence.length > 0) {
    lines.push('## Extracted Evidence', '')
    payload.extraction.evidence.forEach((item, index) => {
      lines.push(`### Evidence ${index + 1}`)
      lines.push(bullet('Excerpt', item.excerpt))
      lines.push(bullet('Type', item.evidence_type))
      lines.push(bullet('Attribution', item.attribution))
      lines.push(bullet('Confidence', item.extraction_confidence))
      lines.push(bullet('Span Start', item.span_start))
      lines.push(bullet('Span End', item.span_end))
      lines.push(bullet('Source Excerpt', item.source_excerpt))
      lines.push('')
    })
  }

  if (payload.extraction.positions.length > 0) {
    lines.push('## Extracted Positions', '')
    payload.extraction.positions.forEach((item, index) => {
      lines.push(`### Position ${index + 1}`)
      lines.push(bullet('Text', item.raw_text))
      lines.push(bullet('Speaker Type', item.speaker_type))
      lines.push(bullet('Position Type', item.position_type))
      lines.push(bullet('Holder', item.holder))
      lines.push(bullet('Confidence', item.extraction_confidence))
      lines.push(bullet('Excerpt', item.excerpt_text))
      lines.push('')
    })
  }

  if (payload.extraction.events.length > 0) {
    lines.push('## Extracted Events', '')
    payload.extraction.events.forEach((item, index) => {
      lines.push(`### Event ${index + 1}`)
      lines.push(bullet('Summary', item.event_summary))
      lines.push(bullet('Type', item.event_type))
      lines.push(bullet('Primary Actor', item.primary_actor))
      lines.push(bullet('Confidence', item.extraction_confidence))
      lines.push('')
    })
  }

  return lines.join('\n')
}
