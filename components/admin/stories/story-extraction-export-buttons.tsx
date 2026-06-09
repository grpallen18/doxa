'use client'

import { useMemo } from 'react'
import { ExportSplitButton } from '@/app/admin/stories/export-split-button'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import {
  buildStoryRecordExportJson,
  buildStoryRecordExportMarkdown,
  buildStoryStageExportJson,
  buildStoryStageExportMarkdown,
} from '@/lib/admin/record-export'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export function StoryExtractionExportButtons({
  payload,
  scope,
  stageId,
  compact = false,
}: {
  payload: StoryExtractionReviewPayload
  scope: 'story_record' | 'story_stage'
  stageId?: PipelineStageId
  compact?: boolean
}) {
  const markdown = useMemo(() => {
    if (scope === 'story_stage' && stageId) {
      return buildStoryStageExportMarkdown(stageId, payload)
    }
    return buildStoryRecordExportMarkdown(payload)
  }, [payload, scope, stageId])

  const json = useMemo(() => {
    if (scope === 'story_stage' && stageId) {
      return buildStoryStageExportJson(stageId, payload)
    }
    return buildStoryRecordExportJson(payload)
  }, [payload, scope, stageId])

  const exportBasename =
    scope === 'story_stage' && stageId
      ? `story-stage-${stageId}-${payload.story.friendly_id}`
      : `story-record-${payload.story.friendly_id}`

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
