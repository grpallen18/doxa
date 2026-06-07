'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  FocusAccordion,
  FocusAccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@/components/admin/pipeline/focus-accordion'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  getRevertBlockedReason,
  getRevertStepDescription,
  isStepRevertible,
  REVERT_SCOPE_STEP_IDS,
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
import { cn } from '@/lib/utils'

function AgentStatusBadge({ step }: { step: PipelineStepState }) {
  const isActive = step.manifestStatus === 'active'

  return (
    <span
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
        isActive
          ? 'bg-[var(--pipeline-step-complete-bg)] text-[var(--pipeline-step-complete-fg)]'
          : 'bg-destructive text-destructive-foreground'
      )}
      title={
        isActive
          ? 'Active in activation.yaml'
          : (step.inactiveNote ?? 'Not active in activation.yaml')
      }
      aria-label={isActive ? 'Agent active' : 'Agent inactive'}
    >
      <Bot className="size-3" aria-hidden />
    </span>
  )
}

function PipelineStepRow({
  step,
  isRunning,
  isReverting,
  isBusy,
  onRun,
  onRevert,
  payload,
  revealTarget,
  renderFeedback,
  spanHighlight,
}: {
  step: PipelineStepState
  isRunning: boolean
  isReverting: boolean
  isBusy: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
  payload: StoryExtractionReviewPayload
  revealTarget: { stepId: PipelineStepId; epoch: number } | null
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
}) {
  const revertible = isStepRevertible(step.id, payload)
  const showRevert = REVERT_SCOPE_STEP_IDS.includes(step.id)

  return (
    <FocusAccordionItem
      value={step.id}
      className="rounded-lg border border-subtle px-3"
    >
      <div className="flex items-center gap-2 py-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="w-full py-2 hover:no-underline [&>svg]:hidden">
            <div className="flex w-full min-w-0 items-center gap-2 text-left">
              <div className="flex shrink-0 items-center gap-2">
                <PipelineStatusIcon status={isRunning ? 'current' : step.status} />
                <AgentStatusBadge step={step} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{step.label}</p>
                {step.progress && <p className="text-xs text-muted">{step.progress}</p>}
                {step.status === 'optional' && (
                  <p className="text-xs text-muted">Not required for this story</p>
                )}
              </div>
            </div>
          </AccordionTrigger>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showRevert && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pipeline-checklist-btn-revert hover:!bg-white hover:!text-destructive"
              disabled={!revertible || isBusy}
              onClick={() => onRevert(step.id)}
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
            variant={step.runnable ? 'default' : 'outline'}
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
    </FocusAccordionItem>
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
  const revertBlockedReason = useMemo(() => getRevertBlockedReason(payload), [payload])
  const [stepError, setStepError] = useState<string | null>(null)
  const [revertingStepId, setRevertingStepId] = useState<PipelineStepId | null>(null)
  const [revertTarget, setRevertTarget] = useState<PipelineStepId | null>(null)
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

  const isBusy = runningStepId != null || revertingStepId != null

  const revertStep = async (stepId: PipelineStepId) => {
    setStepError(null)
    setActionMessage(null)
    setRevertingStepId(stepId)
    setRevertTarget(null)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/revert-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: stepId, confirm: true }),
      })
      const json = await res.json()
      if (!res.ok) {
        setStepError(json.error?.message ?? 'Revert failed')
        return
      }
      setActionMessage(`Reverted ${stepId.replace(/-/g, ' ')}`)
      await onRefresh()
    } catch {
      setStepError('Failed to revert pipeline step')
    } finally {
      setRevertingStepId(null)
    }
  }

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

      {revertBlockedReason && (
        <div className="rounded-lg border border-subtle px-3 py-2 text-xs text-muted">
          <p>{revertBlockedReason}</p>
        </div>
      )}

      {stepError && <p className="text-xs text-destructive">{stepError}</p>}
      {actionMessage && <p className="text-xs text-muted">{actionMessage}</p>}

      <FocusAccordion value={expanded} onValueChange={setExpanded} className="space-y-4">
        {stages.map((stage) => {
          const stageSteps = checklist.steps.filter((s) => s.stageId === stage.id)
          if (stageSteps.length === 0) return null

          return (
            <div key={stage.id} className="space-y-2">
              {!stageId && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {stage.label}
                </h4>
              )}
              <div className="space-y-2">
                {stageSteps.map((step) => (
                  <PipelineStepRow
                    key={step.id}
                    step={step}
                    isRunning={runningStepId === step.id}
                    isReverting={revertingStepId === step.id}
                    isBusy={isBusy}
                    onRun={runStep}
                    onRevert={setRevertTarget}
                    payload={payload}
                    revealTarget={revealTarget}
                    renderFeedback={renderFeedback}
                    spanHighlight={spanHighlight}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </FocusAccordion>

      <AlertDialog
        open={revertTarget != null}
        onOpenChange={(open) => {
          if (!open) setRevertTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert this step?</AlertDialogTitle>
            <AlertDialogDescription>
              {revertTarget
                ? getRevertStepDescription(revertTarget)
                : 'This will undo the latest completed step.'}{' '}
              Only the latest completed step can be reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertingStepId != null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={revertingStepId != null || revertTarget == null}
              onClick={(e) => {
                e.preventDefault()
                if (revertTarget) void revertStep(revertTarget)
              }}
            >
              {revertingStepId != null ? 'Reverting…' : 'Confirm revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
