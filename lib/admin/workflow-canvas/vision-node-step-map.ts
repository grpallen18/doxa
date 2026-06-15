import { PIPELINE_STEPS, type PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import { VISION_FLOW_NODES } from '@/lib/admin/workflow-canvas/vision-flow-layout'

const catalogStepIdSet = new Set(PIPELINE_STEPS.map((step) => step.id))

const stepIdToNodeId = new Map<PipelineStepId, string>(
  VISION_FLOW_NODES.flatMap((node) => {
    const stepId = node.catalogStepId
    if (!stepId || !catalogStepIdSet.has(stepId as PipelineStepId)) return []
    return [[stepId as PipelineStepId, node.id] as const]
  })
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
