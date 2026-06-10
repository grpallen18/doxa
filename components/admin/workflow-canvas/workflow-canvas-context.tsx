'use client'

import { createContext, useContext } from 'react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'

export type WorkflowCanvasContextValue = {
  storyId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  onSelectNode: (nodeId: string) => void
}

const WorkflowCanvasContext = createContext<WorkflowCanvasContextValue | null>(null)

export function WorkflowCanvasProvider({
  value,
  children,
}: {
  value: WorkflowCanvasContextValue
  children: React.ReactNode
}) {
  return (
    <WorkflowCanvasContext.Provider value={value}>{children}</WorkflowCanvasContext.Provider>
  )
}

export function useWorkflowCanvas(): WorkflowCanvasContextValue {
  const ctx = useContext(WorkflowCanvasContext)
  if (!ctx) throw new Error('useWorkflowCanvas must be used within WorkflowCanvasProvider')
  return ctx
}

export function isCatalogStepId(id: string | null | undefined): id is PipelineStepId {
  if (!id) return false
  return !id.startsWith('vision:')
}
