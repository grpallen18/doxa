'use client'

import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepState } from '@/lib/admin/pipeline-status'
import { PipelineStatusIcon } from '@/components/admin/pipeline/pipeline-status-icon'
import { AgentIconButton } from '@/components/admin/record/agent-icon-button'
import { cn } from '@/lib/utils'

export function LifecycleStage({
  step,
  isRunning,
  onSelect,
  className,
}: {
  step: PipelineStepState
  isRunning?: boolean
  onSelect?: (stepId: PipelineStepId) => void
  className?: string
}) {
  const status = isRunning ? 'current' : step.status

  return (
    <button
      type="button"
      id={`step-${step.id}`}
      className={cn(
        'flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1 scroll-mt-28 px-1 text-center',
        className
      )}
      onClick={() => onSelect?.(step.id)}
      title={step.label}
    >
      <div className="flex items-center gap-1">
        <PipelineStatusIcon status={status} />
        <AgentIconButton
          stepId={step.id}
          manifestStatus={step.manifestStatus}
          inactiveNote={step.inactiveNote}
        />
      </div>
      <span className="max-w-[5.5rem] text-[10px] font-medium leading-tight text-foreground sm:text-xs">
        {step.label}
      </span>
      {step.progress && (
        <span className="max-w-[5.5rem] truncate text-[9px] text-muted">{step.progress}</span>
      )}
    </button>
  )
}
