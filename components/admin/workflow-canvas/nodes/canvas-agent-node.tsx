'use client'

import { type NodeProps } from '@xyflow/react'
import { CanvasRunningBar } from '@/components/admin/workflow-canvas/canvas-running-bar'
import { CanvasInvisibleHandles } from '@/components/admin/workflow-canvas/nodes/canvas-invisible-handles'
import { Play, RotateCcw, TriangleAlert } from 'lucide-react'
import { CanvasStepIconAvatar } from '@/components/admin/workflow-canvas/canvas-step-icon'
import {
  CanvasGlowIcon,
} from '@/components/admin/workflow-canvas/canvas-glow-icon'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { isStepRevertible } from '@/lib/admin/story-pipeline-checklist'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  resolveRunnableHighlightTone,
  runnableHighlightClasses,
} from '@/lib/admin/workflow-canvas/runnable-node-highlight'
import { isCatalogStepId, useWorkflowCanvas } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { cn } from '@/lib/utils'

type AgentNodeData = {
  label: string
  maturity: string
  catalogStepId: PipelineStepId | null
  runnable: boolean
  retries?: number
  inDevelopment?: boolean
  developmentNote?: string
  iconVariant?: 'bot' | 'human' | 'cloud'
}

/** Card outline + halo when Run is available — tune alongside ACTION_ICON_GLOW. */
const RUNNABLE_HIGHLIGHT_TRANSITION =
  'transition-[border-color,box-shadow] duration-300 ease-out' as const

export function CanvasAgentNode({ data, selected, id }: NodeProps) {
  const nodeData = data as AgentNodeData
  const {
    label,
    catalogStepId,
    runnable,
    retries = 0,
    inDevelopment = false,
    developmentNote,
    iconVariant = 'bot',
  } = nodeData
  const { payload, pipelineActions, hoveredNodeId } = useWorkflowCanvas()
  const stepId = catalogStepId ?? (isCatalogStepId(id) ? id : null)
  const isRunning = stepId ? pipelineActions.isStepRunning(stepId) : false
  const isReverting = stepId ? pipelineActions.revertingStepId === stepId : false
  const revertible = stepId ? isStepRevertible(stepId, payload) : false
  const canRun = Boolean(runnable && !isRunning && !isReverting)
  const canRevert = Boolean(revertible && !isReverting && !isRunning)
  const isHoveredFromList = hoveredNodeId === id
  const highlightTone = resolveRunnableHighlightTone(canRun, isHoveredFromList)
  const highlight = runnableHighlightClasses(highlightTone)

  const devTooltip =
    developmentNote ??
    'This step is still in development and is not yet deployed.'

  return (
    <div
      className={cn(
        'relative w-64 rounded-xl border bg-zinc-900/80 backdrop-blur-md overflow-hidden group',
        RUNNABLE_HIGHLIGHT_TRANSITION,
        highlight.borderClass,
        selected && !canRun && 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]',
        !canRun && !selected && 'border-white/10 shadow-lg'
      )}
      style={highlight.boxShadow ? { boxShadow: highlight.boxShadow } : undefined}
    >
      <CanvasInvisibleHandles />

      {inDevelopment ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="absolute right-2 top-2 z-10 rounded-md p-0.5 text-amber-400 hover:bg-amber-500/10"
                onClick={(e) => e.stopPropagation()}
              >
                <TriangleAlert className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs bg-zinc-900 text-zinc-200 border border-white/10"
            >
              {devTooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <div className="flex items-center gap-2 border-b border-white/5 bg-zinc-950/30 p-3">
        <CanvasStepIconAvatar variant={iconVariant} />
        <h3 className="min-w-0 truncate text-sm font-semibold leading-tight text-zinc-100">
          {label}
        </h3>
      </div>

      {isRunning ? <CanvasRunningBar /> : null}

      {stepId ? (
        <div className="flex items-center justify-center gap-1 bg-zinc-950/50 px-2 py-1.5">
          <button
            type="button"
            className="rounded p-1 transition-colors hover:bg-white/10 disabled:opacity-40"
            title="Run step"
            disabled={!canRun}
            onClick={(e) => {
              e.stopPropagation()
              void pipelineActions.runStep(stepId)
            }}
          >
            <CanvasGlowIcon icon={Play} active={canRun} tone="emerald" filled />
          </button>
          <button
            type="button"
            className="rounded p-1 transition-colors hover:bg-white/10 disabled:opacity-40"
            title="Revert step"
            disabled={!canRevert}
            onClick={(e) => {
              e.stopPropagation()
              pipelineActions.requestRevert(stepId)
            }}
          >
            <CanvasGlowIcon icon={RotateCcw} active={canRevert} tone="rose" />
          </button>
          {retries > 0 ? (
            <span className="text-[10px] text-amber-400">{retries}/3</span>
          ) : null}
        </div>
      ) : null}

    </div>
  )
}
