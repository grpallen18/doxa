'use client'

import { Bot, Moon } from 'lucide-react'
import { StageActionButtons } from '@/components/admin/record/stage-action-buttons'
import type { FlowPlaceholderStepId } from '@/lib/admin/pipeline-flow-layout'
import { getFlowPlaceholderLabel } from '@/lib/admin/pipeline-flow-labels'
import { cn } from '@/lib/utils'

export function PipelineFlowPlaceholderNode({
  stepId,
}: {
  stepId: FlowPlaceholderStepId
}) {
  const label = getFlowPlaceholderLabel(stepId)

  return (
    <div
      id={`step-${stepId}`}
      className="scroll-mt-28 flex w-max max-w-full items-center gap-x-2 py-0.5"
    >
      <span
        className={cn(
          'relative inline-flex size-5 shrink-0 items-center justify-center rounded-full',
          'bg-[var(--agent-icon-inactive-bg)] text-[var(--agent-icon-inactive-fg)]'
        )}
        title="Planned agent — not wired yet"
        aria-hidden
      >
        <Bot className="size-3" />
        <span className="absolute -right-0.5 -top-0.5 flex size-[9px] items-center justify-center rounded-full bg-surface shadow-sm ring-1 ring-subtle">
          <Moon className="size-[7px] stroke-[2.5] text-muted" />
        </span>
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <StageActionButtons
          stepId="review-merged-extraction"
          label={label}
          runnable={false}
          revertible={false}
          showRevert
          isRunning={false}
          isReverting={false}
          onRun={() => {}}
          onRevert={() => {}}
          compact
        />
        <p className="whitespace-nowrap text-xs font-medium leading-none text-muted">{label}</p>
      </div>
    </div>
  )
}
