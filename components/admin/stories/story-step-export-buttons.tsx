'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  buildChunkStepExportJson,
  buildChunkStepExportMarkdown,
  buildStoryStepExportJson,
  buildStoryStepExportMarkdown,
  chunkStepExportBasename,
  isChunkStepExportable,
} from '@/lib/admin/record-export'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export function StoryStepExportButtons({
  stepId,
  payload,
  chunkIndex,
  compact = true,
  variant = 'default',
}: {
  stepId: PipelineStepId
  payload: StoryExtractionReviewPayload
  chunkIndex?: number
  compact?: boolean
  variant?: 'default' | 'dark'
}) {
  const useChunkExport = isChunkStepExportable(stepId, chunkIndex)

  const markdown = useMemo(() => {
    if (useChunkExport) {
      return buildChunkStepExportMarkdown(stepId, payload, { chunkIndex })
    }
    return buildStoryStepExportMarkdown(stepId, payload)
  }, [stepId, payload, chunkIndex, useChunkExport])

  const json = useMemo(() => {
    if (useChunkExport) {
      return buildChunkStepExportJson(stepId, payload, { chunkIndex })
    }
    return buildStoryStepExportJson(stepId, payload)
  }, [stepId, payload, chunkIndex, useChunkExport])

  const exportBasename = useChunkExport
    ? chunkStepExportBasename(stepId, payload, chunkIndex)
    : `story-step-${stepId}-${payload.story.friendly_id}`

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ExportSplitButton
        compact={compact}
        variant={variant}
        label=".MD"
        copyLabel="Copy markdown"
        downloadLabel="Download markdown"
        content={markdown}
        downloadFilename={`${exportBasename}.md`}
        downloadMimeType="text/markdown"
      />
      <ExportSplitButton
        compact={compact}
        variant={variant}
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
