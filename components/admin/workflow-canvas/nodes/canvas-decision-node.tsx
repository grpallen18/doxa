'use client'

import { type NodeProps } from '@xyflow/react'
import { Play, RotateCcw, Split } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  isChunkStepRevertible,
  isStepRevertible,
} from '@/lib/admin/story-pipeline-checklist'
import { resolveRunnableHighlightTone } from '@/lib/admin/workflow-canvas/runnable-node-highlight'
import { useWorkflowCanvas } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { CanvasUtilityNodeShell } from '@/components/admin/workflow-canvas/nodes/canvas-utility-node-shell'

type DecisionNodeData = {
  label: string
  desc?: string
  result?: string
  status?: string
  catalogStepId: PipelineStepId | null
  runnable: boolean
  maturity?: string
}

export function CanvasDecisionNode({ data, selected, id }: NodeProps) {
  const nodeData = data as DecisionNodeData
  const { label, desc, result, status, catalogStepId, runnable, maturity } = nodeData
  const { payload, pipelineActions, hoveredNodeId, chunkIndex, canvasScope } = useWorkflowCanvas()
  const stepId = catalogStepId
  const chunk = chunkIndex != null ? payload.chunks.find((c) => c.chunk_index === chunkIndex) : null
  const isRunning = stepId ? pipelineActions.isStepRunning(stepId) : false
  const isReverting = stepId ? pipelineActions.revertingStepId === stepId : false
  const revertible =
    stepId && canvasScope === 'chunk' && chunk
      ? isChunkStepRevertible(stepId, chunk, payload)
      : stepId
        ? isStepRevertible(stepId, payload)
        : false
  const canRun = Boolean(runnable && !isRunning && !isReverting)
  const isHoveredFromList = hoveredNodeId === id
  const runnableHighlight = resolveRunnableHighlightTone(canRun, isHoveredFromList)

  const displayStatus =
    result || status || (maturity !== 'live' ? 'Planned' : undefined)

  const actions =
    stepId && (runnable || revertible) ? (
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
      icon={<Split className="w-4 h-4" />}
      label={label}
      desc={desc}
      status={displayStatus}
      selected={selected}
      actions={actions}
      runnableHighlight={runnableHighlight}
    />
  )
}
