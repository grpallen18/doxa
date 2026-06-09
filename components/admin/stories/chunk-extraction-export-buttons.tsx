'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import type { ChunkRecord } from '@/lib/admin/chunk-record'
import {
  buildChunkRecordExportJson,
  buildChunkRecordExportMarkdown,
} from '@/lib/admin/record-export'

export function ChunkExtractionExportButtons({
  record,
  compact = false,
}: {
  record: ChunkRecord
  compact?: boolean
}) {
  const markdown = useMemo(() => buildChunkRecordExportMarkdown(record), [record])
  const json = useMemo(() => buildChunkRecordExportJson(record), [record])
  const exportBasename = `chunk-record-${record.chunk_friendly_id}`

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
