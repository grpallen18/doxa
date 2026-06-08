'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import type { ChunkRecord } from '@/lib/admin/chunk-record'
import {
  buildChunkExtractionReviewJson,
  buildChunkExtractionReviewMarkdown,
} from '@/lib/admin/chunk-extraction-export'

export function ChunkExtractionExportButtons({
  record,
  compact = true,
}: {
  record: ChunkRecord
  compact?: boolean
}) {
  const markdown = useMemo(() => buildChunkExtractionReviewMarkdown(record), [record])
  const json = useMemo(() => buildChunkExtractionReviewJson(record), [record])
  const exportBasename = `chunk-extraction-${record.chunk_friendly_id}`

  return (
    <>
      <ExportSplitButton
        compact={compact}
        label={compact ? '.MD' : 'Markdown'}
        copyLabel="Copy markdown"
        downloadLabel="Download markdown"
        content={markdown}
        downloadFilename={`${exportBasename}.md`}
        downloadMimeType="text/markdown"
      />
      <ExportSplitButton
        compact={compact}
        label={compact ? '.JSON' : 'JSON'}
        copyLabel="Copy JSON"
        downloadLabel="Download JSON"
        content={json}
        downloadFilename={`${exportBasename}.json`}
        downloadMimeType="application/json"
      />
    </>
  )
}
