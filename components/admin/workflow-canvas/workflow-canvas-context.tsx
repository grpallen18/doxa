'use client'

import { createContext, useContext } from 'react'
import { PIPELINE_STEPS, type PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

const CATALOG_STEP_ID_SET = new Set(PIPELINE_STEPS.map((step) => step.id))
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import type { ChunkPipelineActions } from '@/components/admin/pipeline/use-chunk-pipeline-actions'

export type WorkflowPipelineActions =
  | ReturnType<typeof useStoryPipelineActions>
  | ChunkPipelineActions

export type WorkflowCanvasContextValue = {
  storyId: string
  payload: StoryExtractionReviewPayload
  pipelineActions: WorkflowPipelineActions
  canvasScope: 'story' | 'chunk'
  chunkIndex?: number
  onSelectNode: (nodeId: string | null) => void
  hoveredNodeId: string | null
  setHoveredNodeId: (nodeId: string | null) => void
  onOpenChunkWorkflows?: () => void
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
  if (!id || id.startsWith('vision:')) return false
  return CATALOG_STEP_ID_SET.has(id as PipelineStepId)
}
