'use client'

import { useMemo, type ReactNode } from 'react'
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
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  getRevertBlockedReason,
  isStepRevertible,
  REVERT_SCOPE_STEP_IDS,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import { PipelineStatusIcon } from '@/components/admin/pipeline/pipeline-status-icon'
import {
  PipelineStepDetail,
  type PipelineStepDetailProps,
  type SpanHighlightProps,
} from '@/components/admin/pipeline/pipeline-step-details'
import { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { AgentIconButton } from '@/components/admin/record/agent-icon-button'
import { StageActionButtons } from '@/components/admin/record/stage-action-buttons'

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
      id={`step-${step.id}`}
      className="scroll-mt-28 rounded-lg border border-subtle px-3"
    >
      <div className="flex items-center gap-2 py-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="w-full py-2 hover:no-underline [&>svg]:hidden">
            <div className="flex w-full min-w-0 items-center gap-2 text-left">
              <div className="flex shrink-0 items-center gap-2">
                <PipelineStatusIcon status={isRunning ? 'current' : step.status} />
                <AgentIconButton
                  stepId={step.id}
                  manifestStatus={step.manifestStatus}
                  inactiveNote={step.inactiveNote}
                />
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
        <StageActionButtons
          stepId={step.id}
          label={step.label}
          runnable={step.runnable}
          revertible={revertible}
          showRevert={showRevert}
          isRunning={isRunning}
          isReverting={isReverting}
          isBusy={isBusy}
          onRun={onRun}
          onRevert={onRevert}
        />
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
  stepIds,
  onRefresh,
  onApproveQa,
  approvingQa,
  headerActions,
  toolbarActions,
  renderFeedback,
  spanHighlight,
  title = 'Pipeline',
  description = 'Run one step at a time. Expand a step to review its output.',
  showBlockedBanner = true,
  showRevertBlockedNotice = true,
  pipelineActions: externalActions,
}: {
  payload: StoryExtractionReviewPayload
  storyId: string
  stageId?: PipelineStageId
  stepIds?: PipelineStepId[]
  onRefresh: () => Promise<void>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
  headerActions?: ReactNode
  toolbarActions?: ReactNode
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
  title?: string
  description?: string
  showBlockedBanner?: boolean
  showRevertBlockedNotice?: boolean
  pipelineActions?: ReturnType<typeof useStoryPipelineActions>
}) {
  const internalActions = useStoryPipelineActions({ storyId, payload, onRefresh })
  const actions = externalActions ?? internalActions

  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const revertBlockedReason = useMemo(() => getRevertBlockedReason(payload), [payload])

  const filteredSteps = useMemo(() => {
    let steps = checklist.steps
    if (stepIds?.length) {
      const order = new Map(stepIds.map((id, i) => [id, i]))
      steps = steps
        .filter((s) => stepIds.includes(s.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    } else if (stageId) {
      steps = steps.filter((s) => s.stageId === stageId)
    }
    return steps
  }, [checklist.steps, stepIds, stageId])

  const stages = useMemo(() => {
    if (stepIds?.length) {
      const stageIds = [...new Set(filteredSteps.map((s) => s.stageId))]
      return checklist.stages.filter((s) => stageIds.includes(s.id))
    }
    if (stageId) {
      return checklist.stages.filter((s) => s.id === stageId)
    }
    return checklist.stages
  }, [checklist.stages, filteredSteps, stepIds, stageId])

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

      {showBlockedBanner && checklist.isPipelineBlocked && checklist.blockedReason && (
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

      {showRevertBlockedNotice && revertBlockedReason && (
        <div className="rounded-lg border border-subtle px-3 py-2 text-xs text-muted">
          <p>{revertBlockedReason}</p>
        </div>
      )}

      {actions.stepError && <p className="text-xs text-destructive">{actions.stepError}</p>}
      {actions.actionMessage && <p className="text-xs text-muted">{actions.actionMessage}</p>}

      <FocusAccordion
        value={actions.expanded}
        onValueChange={actions.setExpanded}
        className="space-y-4"
      >
        {stages.map((stage) => {
          const stageSteps = filteredSteps.filter((s) => s.stageId === stage.id)
          if (stageSteps.length === 0) return null

          return (
            <div key={stage.id} className="space-y-2">
              {!stageId && !stepIds?.length && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {stage.label}
                </h4>
              )}
              <div className="space-y-2">
                {stageSteps.map((step) => (
                  <PipelineStepRow
                    key={step.id}
                    step={step}
                    isRunning={actions.runningStepId === step.id}
                    isReverting={actions.revertingStepId === step.id}
                    isBusy={actions.isBusy}
                    onRun={actions.runStep}
                    onRevert={actions.requestRevert}
                    payload={payload}
                    revealTarget={actions.revealTarget}
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
        open={actions.revertTarget != null}
        onOpenChange={(open) => {
          if (!open) actions.cancelRevert()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert this step?</AlertDialogTitle>
            <AlertDialogDescription>
              {actions.revertTarget
                ? actions.getRevertStepDescription(actions.revertTarget)
                : 'This will undo the latest completed step.'}{' '}
              Only the latest completed step can be reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.revertingStepId != null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={actions.revertingStepId != null || actions.revertTarget == null}
              onClick={(e) => {
                e.preventDefault()
                actions.confirmRevert()
              }}
            >
              {actions.revertingStepId != null ? 'Reverting…' : 'Confirm revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
