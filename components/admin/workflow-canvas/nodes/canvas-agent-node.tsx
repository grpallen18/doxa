'use client'

import Link from 'next/link'
import { type NodeProps } from '@xyflow/react'
import { CanvasInvisibleHandles } from '@/components/admin/workflow-canvas/nodes/canvas-invisible-handles'
import { Bot, Edit3, FileJson, Play, RotateCcw, TriangleAlert, User } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { isStepRevertible } from '@/lib/admin/story-pipeline-checklist'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { isCatalogStepId, useWorkflowCanvas } from '@/components/admin/workflow-canvas/workflow-canvas-context'
import { cn } from '@/lib/utils'

type AgentNodeData = {
  label: string
  desc?: string
  status: string
  maturity: string
  catalogStepId: PipelineStepId | null
  runnable: boolean
  retries?: number
  inDevelopment?: boolean
  developmentNote?: string
  iconVariant?: 'bot' | 'human'
}

const statusColors: Record<string, string> = {
  Ready: 'text-zinc-400 border-zinc-700 bg-zinc-800/50',
  Running: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  Approved: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  Failed: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  'Needs Review': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Refining: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
  'Human Review': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  Keep: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  Drop: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  Pending: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  'N/A': 'text-zinc-400 border-zinc-600/40 bg-zinc-800/60',
  'Awaiting review': 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  Pass: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  Fail: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  'Needs Refinement': 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  Planned: 'text-zinc-400 border-zinc-700 bg-zinc-800/50',
}

export function CanvasAgentNode({ data, selected, id }: NodeProps) {
  const nodeData = data as AgentNodeData
  const {
    status,
    label,
    desc,
    catalogStepId,
    runnable,
    retries = 0,
    inDevelopment = false,
    developmentNote,
    iconVariant = 'bot',
  } = nodeData
  const StepIcon = iconVariant === 'human' ? User : Bot
  const { payload, pipelineActions, onSelectNode } = useWorkflowCanvas()
  const statusColor = statusColors[status] ?? statusColors.Ready
  const stepId = catalogStepId ?? (isCatalogStepId(id) ? id : null)
  const isRunning = stepId ? pipelineActions.isStepRunning(stepId) : false
  const isReverting = stepId ? pipelineActions.revertingStepId === stepId : false
  const revertible = stepId ? isStepRevertible(stepId, payload) : false

  const devTooltip =
    developmentNote ??
    'This step is still in development and is not yet deployed.'

  return (
    <div
      className={cn(
        'relative w-64 rounded-xl border bg-zinc-900/80 backdrop-blur-md overflow-hidden transition-all group',
        selected
          ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]'
          : 'border-white/10 shadow-lg'
      )}
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

      <div className="p-3 border-b border-white/5 flex items-start justify-between bg-zinc-950/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-white/5 border border-white/10 text-indigo-400 shrink-0">
            <StepIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 leading-tight truncate">{label}</h3>
            {desc ? (
              <p className="text-[10px] text-zinc-500 leading-tight mt-0.5 line-clamp-2">{desc}</p>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border shrink-0',
            statusColor,
            inDevelopment && 'mr-4'
          )}
        >
          {status}
        </div>
      </div>

      {(status === 'Running' || status === 'Refining' || isRunning) && (
        <div className="h-0.5 w-full bg-zinc-800">
          <div className="h-full bg-blue-500 w-2/3 animate-pulse" />
        </div>
      )}

      {stepId ? (
        <div className="px-2 py-1.5 flex items-center justify-between bg-zinc-950/50">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
              title="Run step"
              disabled={!runnable || isRunning || isReverting}
              onClick={(e) => {
                e.stopPropagation()
                void pipelineActions.runStep(stepId)
              }}
            >
              <Play className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-indigo-400 transition-colors"
              title="Inspect"
              onClick={(e) => {
                e.stopPropagation()
                onSelectNode(id)
              }}
            >
              <FileJson className="w-3.5 h-3.5" />
            </button>
            {catalogStepId ? (
              <Link
                href={`/admin/agents/${stepId}`}
                className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Edit prompt"
                onClick={(e) => e.stopPropagation()}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-40"
              title="Revert step"
              disabled={!revertible || isReverting || isRunning}
              onClick={(e) => {
                e.stopPropagation()
                pipelineActions.requestRevert(stepId)
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {retries > 0 ? (
              <span className="text-[10px] text-amber-400">{retries}/3</span>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  )
}
