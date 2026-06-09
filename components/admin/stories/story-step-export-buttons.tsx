'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  buildStoryStepExportJson,
  buildStoryStepExportMarkdown,
} from '@/lib/admin/record-export'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export function StoryStepExportButtons({
  stepId,
  payload,
  compact = true,
}: {
  stepId: PipelineStepId
  payload: StoryExtractionReviewPayload
  compact?: boolean
}) {
  const markdown = useMemo(
    () => buildStoryStepExportMarkdown(stepId, payload),
    [stepId, payload]
  )
  const json = useMemo(() => buildStoryStepExportJson(stepId, payload), [stepId, payload])
  const exportBasename = `story-step-${stepId}-${payload.story.friendly_id}`

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ExportSplitButton
        compact={compact}
        label=".MD"
        copyLabel="Copy markdown"
        downloadLabel="Download markdown"
        content={markdown}
        downloadFilename={`${exportBasename}.md`}
        downloadMimeType="text/markdown"
      />
      <ExportSplitButton
        compact={compact}
        label=".JSON"
        copyLabel="Copy JSON"
        downloadLabel="Download JSON"
        content={json}
        downloadFilename={`${exportBasename}.json`}
        downloadMimeType="application/json"
      />
    </div>
  )
}
