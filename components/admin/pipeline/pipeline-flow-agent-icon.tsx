'use client'

import Link from 'next/link'
import { Bot, Check, Moon } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { formatExportDate } from '@/lib/admin/record-export/shared'
import { getStoryStepCompletedAt } from '@/lib/admin/story-step-metadata'
import type { PipelineStepStatus } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { StoryStepExportButtons } from '@/components/admin/stories/story-step-export-buttons'
import { Button } from '@/components/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function FlowAgentIcon({
  stepId,
  agentLabel,
  payload,
  manifestStatus,
  inactiveNote,
  stepComplete,
  stepStatus,
  isRunning,
  className,
}: {
  stepId: PipelineStepId
  agentLabel: string
  payload: StoryExtractionReviewPayload
  manifestStatus: string
  inactiveNote?: string | null
  stepComplete: boolean
  stepStatus: PipelineStepStatus
  /** Step is executing via Run/Revert — shown in tooltip only. */
  isRunning?: boolean
  className?: string
}) {
  const isAgentActive = manifestStatus === 'active'
  const completedAt = getStoryStepCompletedAt(stepId, payload)
  const run = payload.step_runs?.[stepId]
  const statusHint = [
    run ? `Run log: ${run.outcome}` : stepComplete ? 'Step complete' : 'Step incomplete',
    isRunning ? 'Running' : 'Idle',
    isAgentActive ? 'Agent active' : (inactiveNote ?? 'Agent dormant'),
  ].join(' · ')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80',
            stepStatus === 'complete' || stepStatus === 'optional'
              ? 'bg-[var(--agent-icon-active-bg)] text-[var(--agent-icon-active-fg)]'
              : stepStatus === 'current'
                ? 'bg-[var(--pipeline-step-current-bg)] text-white'
                : stepStatus === 'blocked'
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-[var(--agent-icon-inactive-bg)] text-[var(--agent-icon-inactive-fg)]',
            className
          )}
          title={statusHint}
          aria-label={`Open ${agentLabel} details`}
          onClick={(e) => e.stopPropagation()}
        >
          <Bot className="size-3" aria-hidden />
          <span
            className="absolute -right-0.5 -top-0.5 flex size-[9px] items-center justify-center rounded-full bg-surface shadow-sm ring-1 ring-subtle"
            aria-hidden
          >
            {isAgentActive ? (
              <Check className="size-[7px] stroke-[3] text-[var(--agent-icon-active-fg)]" />
            ) : (
              <Moon className="size-[7px] stroke-[2.5] text-muted" />
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" side="right">
        <div className="grid gap-4">
          <div className="space-y-1">
            <h4 className="text-sm font-medium leading-none">{agentLabel}</h4>
            <p className="text-xs text-muted">
              {stepComplete
                ? completedAt
                  ? `Completed ${formatExportDate(completedAt)}`
                  : 'Completed — no timestamp recorded'
                : 'Not completed for this story'}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Story metadata</p>
            <StoryStepExportButtons stepId={stepId} payload={payload} />
          </div>

          <div className="flex items-center justify-end gap-2">
            <PopoverClose asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
                Close
              </Button>
            </PopoverClose>
            <Button type="button" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link href={`/admin/agents/${stepId}`}>View Agent</Link>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
