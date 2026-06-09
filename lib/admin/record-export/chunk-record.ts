import { flattenExtractionJson } from '@/lib/admin/chunk-extraction'
import type { ChunkRecord } from '@/lib/admin/chunk-record'
import {
  appendChunkQaMarkdown,
  bullet,
  formatChunkQa,
} from '@/lib/admin/record-export/shared'

export function buildChunkRecordExportPayload(record: ChunkRecord) {
  const extraction = record.extraction_json
    ? flattenExtractionJson(record.chunk_index, record.extraction_json)
    : { claims: [], evidence: [], positions: [], events: [] }

  const qa = formatChunkQa(record)

  return {
    export_scope: 'chunk_record' as const,
    story: {
      story_id: record.story_id,
      story_friendly_id: record.story_friendly_id,
      title: record.story_title,
      url: record.story_url,
    },
    chunk: {
      chunk_friendly_id: record.chunk_friendly_id,
      chunk_index: record.chunk_index,
      chunk_number: record.chunk_index + 1,
      chunk_count: record.chunk_count,
      content_length: record.content.length,
    },
    content: record.content,
    extraction,
    extraction_json: record.extraction_json,
    qa,
  }
}

export function buildChunkRecordExportJson(record: ChunkRecord): string {
  return JSON.stringify(buildChunkRecordExportPayload(record), null, 2)
}

export function buildChunkRecordExportMarkdown(record: ChunkRecord): string {
  const payload = buildChunkRecordExportPayload(record)
  const lines: string[] = []

  lines.push('# Chunk Record Export', '')
  lines.push(bullet('Export scope', payload.export_scope))
  lines.push('')

  lines.push('## Story', '')
  lines.push(bullet('Story ID', payload.story.story_friendly_id ?? payload.story.story_id))
  lines.push(bullet('Title', payload.story.title))
  lines.push(bullet('URL', payload.story.url))
  lines.push('')

  lines.push('## Chunk', '')
  lines.push(bullet('Chunk ID', payload.chunk.chunk_friendly_id))
  lines.push(bullet('Chunk number', payload.chunk.chunk_number))
  lines.push(bullet('Chunk count', payload.chunk.chunk_count))
  lines.push(bullet('Content length', payload.chunk.content_length))
  lines.push('')

  lines.push('## Chunk text', '')
  lines.push(payload.content || '(no content)')
  lines.push('')

  lines.push('## Extracted claims', '')
  if (payload.extraction.claims.length === 0) {
    lines.push('(no claims)')
  } else {
    payload.extraction.claims.forEach((claim, index) => {
      lines.push(`### Claim ${index + 1}`)
      lines.push(bullet('Claim ID', claim.claim_id))
      lines.push(bullet('Text', claim.raw_text))
      lines.push(bullet('Polarity', claim.polarity))
      lines.push(bullet('Stance', claim.stance))
      lines.push('')
    })
  }

  appendChunkQaMarkdown(lines, payload.qa)

  return lines.join('\n')
}
