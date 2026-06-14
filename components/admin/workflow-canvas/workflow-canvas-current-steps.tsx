'use client'

import { useCallback } from 'react'
import { Panel, useReactFlow } from '@xyflow/react'
import type { PipelineChecklist } from '@/lib/admin/story-pipeline-checklist'
import { getRunnableCanvasSteps } from '@/lib/admin/workflow-canvas/vision-node-step-map'
import { resolveAgentDisplayName } from '@/lib/admin/agent-display-names'
import { useAgentDisplayNames } from '@/components/admin/agents/use-agent-display-names'
import { useWorkflowCanvas } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { cn } from '@/lib/utils'

export function WorkflowCanvasCurrentSteps({
  checklist,
}: {
  checklist: PipelineChecklist
}) {
  const { onSelectNode, setHoveredNodeId } = useWorkflowCanvas()
  const { setNodes } = useReactFlow()
  const { displayNames } = useAgentDisplayNames()
  const runnableSteps = getRunnableCanvasSteps(checklist)

  const selectNode = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId)
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: node.id === nodeId,
        }))
      )
    },
    [onSelectNode, setNodes]
  )

  return (
    <Panel position="top-left" className="!m-4 !pointer-events-auto">
      <div className="max-w-[220px] px-1 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
          Current Step(s):
        </p>
        {runnableSteps.length === 0 ? (
          <p className="mt-2 text-xs text-white/70">None</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {runnableSteps.map((step) => (
              <li key={step.stepId}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-white',
                    'transition-colors duration-300 hover:text-cyan-400'
                  )}
                  onMouseEnter={() => setHoveredNodeId(step.nodeId)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onFocus={() => setHoveredNodeId(step.nodeId)}
                  onBlur={() => setHoveredNodeId(null)}
                  onClick={() => selectNode(step.nodeId)}
                >
                  {resolveAgentDisplayName(step.stepId, step.label, displayNames)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
