'use client'

import { createContext, useContext } from 'react'
import type {
  EdgeEndpointOverride,
  WorkflowCanvasEdgeAttachments,
} from '@/lib/admin/workflow-canvas/edge-attachments'
import type {
  EdgeColor,
  WorkflowCanvasEdgeMetaMap,
} from '@/lib/admin/workflow-canvas/edge-meta'

export type WorkflowCanvasLayoutContextValue = {
  edgeAttachments: WorkflowCanvasEdgeAttachments
  edgeMeta: WorkflowCanvasEdgeMetaMap
  editingEdgeId: string | null
  setEdgeEndpointOverride: (
    edgeId: string,
    role: 'source' | 'target',
    override: EdgeEndpointOverride
  ) => void
  setEdgeLabel: (edgeId: string, label: string) => void
  setEdgeColor: (edgeId: string, color: EdgeColor) => void
  setEditingEdgeId: (edgeId: string | null) => void
}

const WorkflowCanvasLayoutContext =
  createContext<WorkflowCanvasLayoutContextValue | null>(null)

export function WorkflowCanvasLayoutProvider({
  value,
  children,
}: {
  value: WorkflowCanvasLayoutContextValue
  children: React.ReactNode
}) {
  return (
    <WorkflowCanvasLayoutContext.Provider value={value}>
      {children}
    </WorkflowCanvasLayoutContext.Provider>
  )
}

export function useWorkflowCanvasLayoutContext(): WorkflowCanvasLayoutContextValue {
  const ctx = useContext(WorkflowCanvasLayoutContext)
  if (!ctx) {
    throw new Error(
      'useWorkflowCanvasLayoutContext must be used within WorkflowCanvasLayoutProvider'
    )
  }
  return ctx
}
