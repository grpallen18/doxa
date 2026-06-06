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
  storyId,
}: {
  payload: StoryExtractionReviewPayload
  storyId: string
}) {
  const markdown = useMemo(() => buildExtractionReviewMarkdown(payload), [payload])
  const json = useMemo(() => buildExtractionReviewJson(payload), [payload])
  const exportBasename = `story-extraction-${storyId.slice(0, 8)}`

  return (
    <>
      <ExportSplitButton
        label="Markdown"
        copyLabel="Copy markdown"
        downloadLabel="Download markdown"
        content={markdown}
        downloadFilename={`${exportBasename}.md`}
        downloadMimeType="text/markdown"
      />
      <ExportSplitButton
        label="JSON"
        copyLabel="Copy JSON"
        downloadLabel="Download JSON"
        content={json}
        downloadFilename={`${exportBasename}.json`}
        downloadMimeType="application/json"
      />
    </>
  )
}
