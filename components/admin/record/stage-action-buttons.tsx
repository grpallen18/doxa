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
  isBusy,
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
  isBusy: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
  compact?: boolean
}) {
  const btnClass = compact ? 'h-6 px-2 text-[11px]' : undefined
  const runBtnClass = cn(btnClass, compact && 'w-9 shrink-0')
  const iconClass = compact ? 'mr-0.5 size-2.5' : 'mr-1 size-3'

  return (
    <div className={compact ? 'flex shrink-0 items-center gap-1' : 'flex shrink-0 items-center gap-2'}>
      {showRevert && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('pipeline-checklist-btn-revert hover:!bg-white hover:!text-destructive', btnClass)}
          disabled={!revertible || isBusy}
          onClick={() => onRevert(stepId)}
        >
          {isReverting ? (
            <>
              <Loader2 className={cn(iconClass, 'animate-spin')} />
              Reverting…
            </>
          ) : (
            'Revert'
          )}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant={runnable ? 'default' : 'outline'}
        className={runBtnClass}
        disabled={!runnable || isBusy}
        onClick={() => onRun(stepId)}
        aria-label={`Run ${label}`}
      >
        {isRunning ? (
          <>
            <Loader2 className={cn(iconClass, 'animate-spin')} />
            Running…
          </>
        ) : (
          'Run'
        )}
      </Button>
    </div>
  )
}
