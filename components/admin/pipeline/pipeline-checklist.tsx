'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  EXTRACTION_STEP_GROUPS,
  type PipelineStepId,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import { PipelineStatusIcon } from '@/components/admin/pipeline/pipeline-status-icon'
import {
  PipelineStepDetail,
  type PipelineStepDetailProps,
  type SpanHighlightProps,
} from '@/components/admin/pipeline/pipeline-step-details'
import { usePipelineStepPoll } from '@/components/admin/pipeline/use-pipeline-step-poll'

function groupStepsForStage(
  stageId: PipelineStageId,
  steps: PipelineStepState[]
): Array<{ label: string; description?: string; steps: PipelineStepState[] }> {
  if (stageId !== 'extraction') {
    return [{ label: '', steps }]
  }

  const byId = new Map(steps.map((step) => [step.id, step]))
  const grouped = EXTRACTION_STEP_GROUPS.map((group) => ({
    label: group.label,
    description: group.description,
    steps: group.stepIds.map((id) => byId.get(id)).filter((step): step is PipelineStepState => step != null),
  })).filter((group) => group.steps.length > 0)

  const groupedIds = new Set(EXTRACTION_STEP_GROUPS.flatMap((g) => g.stepIds))
  const remainder = steps.filter((step) => !groupedIds.has(step.id))
  if (remainder.length > 0) {
    grouped.push({ label: 'Other', description: undefined, steps: remainder })
  }

  return grouped
}

function PipelineStepRow({
  step,
  isRunning,
  isBusy,
  onRun,
  payload,
  revealTarget,
  renderFeedback,
  spanHighlight,
}: {
  step: PipelineStepState
  isRunning: boolean
  isBusy: boolean
  onRun: (stepId: PipelineStepId) => void
  payload: StoryExtractionReviewPayload
  revealTarget: { stepId: PipelineStepId; epoch: number } | null
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
}) {
  return (
    <AccordionItem
      value={step.id}
      className={`rounded-lg border border-subtle px-3 ${
        isRunning || step.status === 'current' ? 'bg-muted/30' : ''
      }`}
    >
      <div className="flex items-center gap-2 py-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="w-full py-2 hover:no-underline [&>svg]:hidden">
            <div className="flex w-full min-w-0 items-start gap-3 text-left">
              <PipelineStatusIcon status={isRunning ? 'current' : step.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium leading-tight">{step.label}</p>
                  {step.manifestStatus !== 'active' && (
                    <span
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title={step.inactiveNote ?? undefined}
                    >
                      inactive
                    </span>
                  )}
                </div>
                {step.progress && <p className="text-xs text-muted">{step.progress}</p>}
                {step.status === 'optional' && (
                  <p className="text-xs text-muted">Not required for this story</p>
                )}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        <Button
          type="button"
          size="sm"
          variant={step.status === 'current' ? 'default' : 'outline'}
          className="shrink-0"
          disabled={!step.runnable || isBusy}
          onClick={() => onRun(step.id)}
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
      <AccordionContent className="border-t border-subtle pb-3 pt-2">
        <PipelineStepDetail
          stepId={step.id}
          payload={payload}
          reveal={revealTarget?.stepId === step.id}
          revealKey={revealTarget?.epoch}
          renderFeedback={renderFeedback}
          spanHighlight={spanHighlight}
        />
      </AccordionContent>
    </AccordionItem>
  )
}

export function PipelineChecklist({
  payload,
  storyId,
  stageId,
  onRefresh,
  onApproveQa,
  approvingQa,
  headerActions,
  toolbarActions,
  renderFeedback,
  spanHighlight,
  title = 'Pipeline',
  description = 'Run one step at a time. Expand a step to review its output.',
}: {
  payload: StoryExtractionReviewPayload
  storyId: string
  stageId?: PipelineStageId
  onRefresh: () => Promise<void>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
  headerActions?: ReactNode
  toolbarActions?: ReactNode
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
  title?: string
  description?: string
}) {
  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const [stepError, setStepError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const {
    runningStepId,
    actionMessage,
    setActionMessage,
    revealTarget,
    beginRun,
    cancelRun,
  } = usePipelineStepPoll({ payload, onRefresh })

  const stages = stageId
    ? checklist.stages.filter((s) => s.id === stageId)
    : checklist.stages

  const runStep = async (stepId: PipelineStepId) => {
    setStepError(null)
    setActionMessage(null)
    beginRun(stepId)
    setExpanded((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/run-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStepError(json.error?.message ?? 'Step failed to start')
        cancelRun()
        return
      }
      void onRefresh()
    } catch {
      setStepError('Failed to invoke pipeline step')
      cancelRun()
    }
  }

  const isBusy = runningStepId != null

  useEffect(() => {
    if (!revealTarget) return
    setExpanded((prev) =>
      prev.includes(revealTarget.stepId) ? prev : [...prev, revealTarget.stepId]
    )
  }, [revealTarget])

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-xs text-muted">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          {toolbarActions}
        </div>
      </div>

      {checklist.isPipelineBlocked && checklist.blockedReason && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p>{checklist.blockedReason}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={approvingQa}
            onClick={() => void onApproveQa()}
          >
            {approvingQa ? 'Approving…' : 'Approve QA'}
          </Button>
        </div>
      )}

      {stepError && <p className="text-xs text-destructive">{stepError}</p>}
      {actionMessage && <p className="text-xs text-muted">{actionMessage}</p>}

      <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="space-y-4">
        {stages.map((stage) => {
          const stageSteps = checklist.steps.filter((s) => s.stageId === stage.id)
          if (stageSteps.length === 0) return null
          const stepGroups = groupStepsForStage(stage.id, stageSteps)

          return (
            <div key={stage.id} className="space-y-2">
              {!stageId && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {stage.label}
                </h4>
              )}
              <div className="space-y-4">
                {stepGroups.map((group) => (
                  <div key={group.label || 'default'} className="space-y-2">
                    {group.label && (
                      <div>
                        <p className="text-xs font-semibold text-foreground">{group.label}</p>
                        {group.description && (
                          <p className="text-xs text-muted">{group.description}</p>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      {group.steps.map((step) => (
                        <PipelineStepRow
                          key={step.id}
                          step={step}
                          isRunning={runningStepId === step.id}
                          isBusy={isBusy}
                          onRun={runStep}
                          payload={payload}
                          revealTarget={revealTarget}
                          renderFeedback={renderFeedback}
                          spanHighlight={spanHighlight}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </Accordion>
    </div>
  )
}
