'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { cn } from '@/lib/utils'

export function StageActionButtons({
  stepId,
  label,
  runnable,
  revertible,
  showRevert,
  isRunning,
  isReverting,
  onRun,
  onRevert,
  compact = false,
}: {
  stepId: PipelineStepId
  label: string
  runnable: boolean
  revertible: boolean
  showRevert: boolean
  isRunning: boolean
  isReverting: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
  compact?: boolean
}) {
  const btnClass = compact ? 'h-6 px-2 text-[11px]' : undefined
  const runBtnClass = cn(btnClass, compact && 'w-9 shrink-0')
  const revertBtnClass = compact ? 'h-6 shrink-0 px-1.5 text-[11px]' : 'px-2'
  const spinnerClass = compact ? 'size-2.5' : 'size-3'
  const showRunPrimary = isRunning || runnable

  return (
    <div className={compact ? 'flex shrink-0 items-center gap-1' : 'flex shrink-0 items-center gap-2'}>
      {showRevert && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'pipeline-checklist-btn-revert hover:!bg-white hover:!text-destructive',
            revertBtnClass,
            isReverting && 'disabled:opacity-100'
          )}
          disabled={!revertible || isReverting || isRunning}
          onClick={() => onRevert(stepId)}
          aria-busy={isReverting}
          aria-label={isReverting ? `Reverting ${label}` : `Revert ${label}`}
        >
          <span className="relative inline-flex items-center justify-center">
            <span className={cn(isReverting && 'invisible')}>Revert</span>
            {isReverting && (
              <Loader2 className={cn('absolute animate-spin', spinnerClass)} aria-hidden />
            )}
          </span>
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant={showRunPrimary ? 'default' : 'outline'}
        className={cn(runBtnClass, isRunning && 'disabled:opacity-100')}
        disabled={!runnable || isRunning}
        onClick={() => onRun(stepId)}
        aria-busy={isRunning}
        aria-label={isRunning ? `Running ${label}` : `Run ${label}`}
      >
        <span className="relative inline-flex items-center justify-center">
          <span className={cn(isRunning && 'invisible')}>Run</span>
          {isRunning && (
            <Loader2 className={cn('absolute animate-spin', spinnerClass)} aria-hidden />
          )}
        </span>
      </Button>
    </div>
  )
}
