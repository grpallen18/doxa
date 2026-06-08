'use client'

import type { ComponentProps } from 'react'
import { PipelineChecklist } from '@/components/admin/pipeline/pipeline-checklist'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { STORY_LIFECYCLE_STEP_IDS } from '@/lib/admin/story-lifecycle'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'

type PipelineChecklistProps = ComponentProps<typeof PipelineChecklist>

export function StoryLifecycleSteps({
  storyId,
  payload,
  pipelineActions,
  forceOpen,
  pipelineToolbar,
  onRefresh,
  onApproveQa,
  approvingQa,
  renderFeedback,
  spanHighlight,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  forceOpen?: boolean
  pipelineToolbar: PipelineChecklistProps['headerActions']
  onRefresh: () => Promise<void>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
  renderFeedback: PipelineChecklistProps['renderFeedback']
  spanHighlight: PipelineChecklistProps['spanHighlight']
}) {
  return (
    <RecordSectionCard
      id="agent-outputs"
      title="Lifecycle steps"
      variant="panel"
      forceOpen={forceOpen}
      headerActions={pipelineToolbar}
      className="rounded-lg border border-subtle"
    >
      <PipelineChecklist
        payload={payload}
        storyId={storyId}
        stepIds={STORY_LIFECYCLE_STEP_IDS}
        onRefresh={onRefresh}
        onApproveQa={onApproveQa}
        approvingQa={approvingQa}
        pipelineActions={pipelineActions}
        renderFeedback={renderFeedback}
        spanHighlight={spanHighlight}
        showRevertBlockedNotice={false}
        embedded
      />
    </RecordSectionCard>
  )
}
