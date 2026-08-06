'use client'

import { useCallback, useState } from 'react'
import { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { WorkflowCanvasShell } from '@/components/admin/workflow-canvas/workflow-canvas-shell'

export function WorkflowCanvasPage() {
  const { storyId, payload, refresh } = useStoryReview()
  if (!payload) return null
  return (
    <WorkflowCanvasPageContent storyId={storyId} payload={payload} refresh={refresh} />
  )
}

function WorkflowCanvasPageContent({
  storyId,
  payload,
  refresh,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
  refresh: (silent?: boolean) => Promise<void>
}) {
  const [approving, setApproving] = useState(false)

  const pipelineActions = useStoryPipelineActions({
    storyId,
    payload,
    onRefresh: async () => refresh(true),
  })

  const approveQa = useCallback(async () => {
    // Legacy claims QA override removed — Neo path has no approve gate.
    setApproving(false)
  }, [])

  return (
    <WorkflowCanvasShell
      storyId={storyId}
      payload={payload}
      pipelineActions={pipelineActions}
      onApproveQa={approveQa}
      approvingQa={approving}
    />
  )
}
