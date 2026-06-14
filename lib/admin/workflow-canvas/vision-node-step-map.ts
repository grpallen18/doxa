import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import { VISION_FLOW_NODES } from '@/lib/admin/workflow-canvas/vision-flow-layout'

const stepIdToNodeId = new Map<PipelineStepId, string>(
  VISION_FLOW_NODES.flatMap((node) =>
    node.catalogStepId ? [[node.catalogStepId, node.id] as const] : []
  )
)

export function getVisionNodeIdForStep(stepId: PipelineStepId): string | null {
  return stepIdToNodeId.get(stepId) ?? null
}

export type RunnableCanvasStep = {
  stepId: PipelineStepId
  nodeId: string
  label: string
}

export function getRunnableCanvasSteps(checklist: PipelineChecklist): RunnableCanvasStep[] {
  return checklist.steps.flatMap((step) => {
    if (!step.runnable) return []
    const nodeId = getVisionNodeIdForStep(step.id)
    if (!nodeId) return []
    return [{ stepId: step.id, nodeId, label: step.label }]
  })
}
