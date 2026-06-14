'use client'

import { Loader2, Play, RotateCcw } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { CanvasGlowIcon } from '@/components/admin/workflow-canvas/canvas-glow-icon'
import { cn } from '@/lib/utils'

export function CanvasStepActionButtons({
  stepId,
  runnable,
  revertible,
  isRunning,
  isReverting,
  onRun,
  onRevert,
  size = 'md',
  className,
}: {
  stepId: PipelineStepId
  runnable: boolean
  revertible: boolean
  isRunning: boolean
  isReverting: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const canRun = Boolean(runnable && !isRunning && !isReverting)
  const canRevert = Boolean(revertible && !isReverting && !isRunning)
  const iconSize = size === 'md' ? 'md' : 'sm'
  const buttonPad = size === 'md' ? 'p-2' : 'p-1'

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <button
        type="button"
        className={cn(
          'relative rounded transition-colors hover:bg-white/10 disabled:opacity-40',
          buttonPad
        )}
        title="Run step"
        aria-label="Run step"
        aria-busy={isRunning}
        disabled={!canRun}
        onClick={() => void onRun(stepId)}
      >
        {isRunning ? (
          <Loader2 className="size-5 animate-spin text-emerald-300" aria-hidden />
        ) : (
          <CanvasGlowIcon icon={Play} active={canRun} tone="emerald" filled size={iconSize} />
        )}
      </button>
      <button
        type="button"
        className={cn(
          'relative rounded transition-colors hover:bg-white/10 disabled:opacity-40',
          buttonPad
        )}
        title="Revert step"
        aria-label="Revert step"
        aria-busy={isReverting}
        disabled={!canRevert}
        onClick={() => onRevert(stepId)}
      >
        {isReverting ? (
          <Loader2 className="size-5 animate-spin text-rose-300" aria-hidden />
        ) : (
          <CanvasGlowIcon icon={RotateCcw} active={canRevert} tone="rose" size={iconSize} />
        )}
      </button>
    </div>
  )
}
