'use client'

import { type NodeProps } from '@xyflow/react'
import { GitMerge, Play, RotateCcw } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { isStepRevertible } from '@/lib/admin/story-pipeline-checklist'
import type { AgentDisplayStatus } from '@/lib/admin/workflow-canvas/types'
import { resolveRunnableHighlightTone } from '@/lib/admin/workflow-canvas/runnable-node-highlight'
import { useWorkflowCanvas } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { CanvasUtilityNodeShell } from '@/components/admin/workflow-canvas/nodes/canvas-utility-node-shell'

type MergeNodeData = {
  label: string
  desc?: string
  status?: AgentDisplayStatus | string
  catalogStepId: PipelineStepId | null
  runnable: boolean
  maturity?: string
}

export function CanvasMergeNode({ data, selected, id }: NodeProps) {
  const nodeData = data as MergeNodeData
  const { label, desc, catalogStepId, runnable, status, maturity } = nodeData
  const { payload, pipelineActions, hoveredNodeId } = useWorkflowCanvas()
  const stepId = catalogStepId
  const isRunning = stepId ? pipelineActions.isStepRunning(stepId) : false
  const isReverting = stepId ? pipelineActions.revertingStepId === stepId : false
  const revertible = stepId ? isStepRevertible(stepId, payload) : false
  const canRun = Boolean(runnable && !isRunning && !isReverting)
  const isHoveredFromList = hoveredNodeId === id
  const runnableHighlight = resolveRunnableHighlightTone(canRun, isHoveredFromList)

  const displayStatus = status || (maturity !== 'live' ? 'Planned' : undefined)

  const actions =
    stepId ? (
      <>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10 text-indigo-300 disabled:opacity-40"
          disabled={!runnable || isRunning}
          onClick={(e) => {
            e.stopPropagation()
            void pipelineActions.runStep(stepId)
          }}
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10 text-indigo-300 disabled:opacity-40"
          disabled={!revertible || isRunning}
          onClick={(e) => {
            e.stopPropagation()
            pipelineActions.requestRevert(stepId)
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </>
    ) : null

  return (
    <CanvasUtilityNodeShell
      icon={<GitMerge className="w-4 h-4" />}
      label={label}
      desc={desc}
      status={displayStatus}
      selected={selected}
      actions={actions}
      runnableHighlight={runnableHighlight}
    />
  )
}
