'use client'

import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { useChunkPipelineActions } from '@/components/admin/pipeline/use-chunk-pipeline-actions'
import { ChunkWorkflowCanvasShell } from '@/components/admin/workflow-canvas/chunk-workflow-canvas-shell'

export function ChunkWorkflowCanvasPage({
  chunkIndex,
  chunkFriendlyId,
}: {
  chunkIndex: number
  chunkFriendlyId: string
}) {
  const { storyId, payload, refresh } = useStoryReview()
  if (!payload) return null

  return (
    <ChunkWorkflowCanvasPageContent
      storyId={storyId}
      chunkIndex={chunkIndex}
      chunkFriendlyId={chunkFriendlyId}
      payload={payload}
      refresh={refresh}
    />
  )
}

function ChunkWorkflowCanvasPageContent({
  storyId,
  chunkIndex,
  chunkFriendlyId,
  payload,
  refresh,
}: {
  storyId: string
  chunkIndex: number
  chunkFriendlyId: string
  payload: NonNullable<ReturnType<typeof useStoryReview>['payload']>
  refresh: (silent?: boolean) => Promise<void>
}) {
  const pipelineActions = useChunkPipelineActions({
    storyId,
    chunkIndex,
    payload,
    onRefresh: async () => refresh(true),
  })

  return (
    <ChunkWorkflowCanvasShell
      storyId={storyId}
      chunkIndex={chunkIndex}
      chunkFriendlyId={chunkFriendlyId}
      payload={payload}
      pipelineActions={pipelineActions}
      onRefresh={async () => refresh(true)}
    />
  )
}
