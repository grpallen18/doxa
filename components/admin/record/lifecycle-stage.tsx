'use client'

import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepState } from '@/lib/admin/pipeline-status'
import { PipelineStatusIcon } from '@/components/admin/pipeline/pipeline-status-icon'
import { AgentIconButton } from '@/components/admin/record/agent-icon-button'
import { cn } from '@/lib/utils'

const SHORT_STEP_LABELS: Partial<Record<PipelineStepId, string>> = {
  'relevance-gate': 'Qualify',
  'review-pending-stories': 'Resolve',
  'scrape-story-content': 'Scrape',
  'clean-scraped-content': 'Clean',
  'chunk-story-bodies': 'Chunk',
  'extract-story-claims': 'Extract',
  'validate-chunk-claims': 'Chunk QA',
  'merge-story-claims': 'Merge',
  'review-merged-extraction': 'Review',
  'refine-merged-extraction': 'Refine',
  'validate-merged-extraction': 'Merge QA',
}

const pillStatusClass: Record<string, string> = {
  complete:
    'border-[var(--pipeline-step-complete-bg)]/35 bg-[var(--pipeline-step-complete-bg)]/8 hover:bg-[var(--pipeline-step-complete-bg)]/14',
  current:
    'border-[var(--pipeline-step-current-bg)]/50 bg-[var(--pipeline-step-current-bg)]/10 ring-1 ring-[var(--pipeline-step-current-bg)]/25 hover:bg-[var(--pipeline-step-current-bg)]/16',
  running:
    'border-[var(--pipeline-step-current-bg)]/50 bg-[var(--pipeline-step-current-bg)]/10 ring-1 ring-[var(--pipeline-step-current-bg)]/25 hover:bg-[var(--pipeline-step-current-bg)]/16',
  pending: 'border-subtle bg-muted/25 text-muted-foreground hover:bg-muted/40',
  blocked: 'border-destructive/35 bg-destructive/8 text-destructive hover:bg-destructive/12',
  optional: 'border-subtle bg-muted/15 text-muted-foreground hover:bg-muted/30',
}

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
  const status = isRunning ? 'running' : step.status
  const shortLabel = SHORT_STEP_LABELS[step.id] ?? step.label

  return (
    <button
      type="button"
      className={cn(
        'inline-flex max-w-[9rem] shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left transition-colors scroll-mt-28',
        pillStatusClass[status] ?? pillStatusClass.pending,
        className
      )}
      onClick={() => onSelect?.(step.id)}
      title={step.label}
    >
      <PipelineStatusIcon status={status} size="sm" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium leading-none">
        {shortLabel}
      </span>
      <AgentIconButton
        stepId={step.id}
        manifestStatus={step.manifestStatus}
        inactiveNote={step.inactiveNote}
        variant="subtle"
        className="shrink-0"
      />
    </button>
  )
}
