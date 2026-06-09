'use client'

import type { ReactNode } from 'react'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { PipelineLifecycleFlowchart } from '@/components/admin/pipeline/pipeline-lifecycle-flowchart'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'

export function StoryLifecycleFlowchart({
  payload,
  pipelineActions,
  forceOpen,
  pipelineToolbar,
  onApproveQa,
  approvingQa,
}: {
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  forceOpen?: boolean
  pipelineToolbar?: ReactNode
  onApproveQa: () => Promise<void>
  approvingQa: boolean
}) {
  return (
    <RecordSectionCard
      id="lifecycle-flowchart"
      title="Pipeline map"
      variant="panel"
      forceOpen={forceOpen}
      headerActions={pipelineToolbar}
      className="w-fit max-w-full"
    >
      <PipelineLifecycleFlowchart
        payload={payload}
        pipelineActions={pipelineActions}
        onApproveQa={onApproveQa}
        approvingQa={approvingQa}
      />
    </RecordSectionCard>
  )
}
