'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'

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
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {showRevert && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pipeline-checklist-btn-revert hover:!bg-white hover:!text-destructive"
          disabled={!revertible || isBusy}
          onClick={() => onRevert(stepId)}
        >
          {isReverting ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
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
        disabled={!runnable || isBusy}
        onClick={() => onRun(stepId)}
        aria-label={`Run ${label}`}
      >
        {isRunning ? (
          <>
            <Loader2 className="mr-1 size-3 animate-spin" />
            Running…
          </>
        ) : (
          'Run'
        )}
      </Button>
    </div>
  )
}
