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
    setApproving(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/qa-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_chunks: true }),
      })
      if (res.ok) await refresh(true)
    } finally {
      setApproving(false)
    }
  }, [storyId, refresh])

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
