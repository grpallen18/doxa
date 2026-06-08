'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import {
  buildExtractionReviewJson,
  buildExtractionReviewMarkdown,
  type StoryExtractionReviewPayload,
} from '@/lib/admin/story-extraction-review'

export function StoryExtractionExportButtons({
  payload,
  compact = false,
}: {
  payload: StoryExtractionReviewPayload
  compact?: boolean
}) {
  const markdown = useMemo(() => buildExtractionReviewMarkdown(payload), [payload])
  const json = useMemo(() => buildExtractionReviewJson(payload), [payload])
  const exportBasename = `story-extraction-${payload.story.friendly_id}`

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
