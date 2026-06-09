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
import {
  EXTRACTION_PARALLEL_LANES,
  EXTRACTION_SHARED_STEP_IDS,
  MERGE_QA_STEP_IDS,
} from '@/lib/admin/story-pipeline-checklist'
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
import { cn } from '@/lib/utils'

function renderStepRows(
  stageSteps: PipelineStepState[],
  props: {
    isStepRunning: (stepId: PipelineStepId) => boolean
    revertingStepId: PipelineStepId | null
    onRun: (stepId: PipelineStepId) => void
    onRevert: (stepId: PipelineStepId) => void
    payload: StoryExtractionReviewPayload
    revealTarget: { stepId: PipelineStepId; epoch: number } | null
    renderFeedback?: PipelineStepDetailProps['renderFeedback']
    spanHighlight?: SpanHighlightProps
    embedded?: boolean
  }
) {
  return stageSteps.map((step) => (
    <PipelineStepRow
      key={step.id}
      step={step}
      isRunning={props.isStepRunning(step.id)}
      isReverting={props.revertingStepId === step.id}
      onRun={props.onRun}
      onRevert={props.onRevert}
      payload={props.payload}
      revealTarget={props.revealTarget}
      renderFeedback={props.renderFeedback}
      spanHighlight={props.spanHighlight}
      embedded={props.embedded}
    />
  ))
}

function ExtractionStageSteps({
  stageSteps,
  rowProps,
}: {
  stageSteps: PipelineStepState[]
  rowProps: Parameters<typeof renderStepRows>[1]
}) {
  const stepById = (id: PipelineStepId) => stageSteps.find((step) => step.id === id)
  const sharedSteps = EXTRACTION_SHARED_STEP_IDS.map(stepById).filter(
    (step): step is PipelineStepState => step != null
  )
  const mergeQaSteps = MERGE_QA_STEP_IDS.map(stepById).filter(
    (step): step is PipelineStepState => step != null
  )

  return (
    <div className="space-y-4">
      {sharedSteps.length > 0 && (
        <div className="space-y-2">{renderStepRows(sharedSteps, rowProps)}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {EXTRACTION_PARALLEL_LANES.map((lane) => {
          const laneSteps = lane.stepIds
            .map((id) => stepById(id))
            .filter((step): step is PipelineStepState => step != null)
          if (laneSteps.length === 0) return null

          return (
            <div key={lane.id} className="min-w-0 space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted">{lane.label}</h5>
              {renderStepRows(laneSteps, rowProps)}
            </div>
          )
        })}
      </div>

      {mergeQaSteps.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted">Merge approval</h5>
          {renderStepRows(mergeQaSteps, rowProps)}
        </div>
      )}
    </div>
  )
}

function PipelineStepRow({
  step,
  isRunning,
  isReverting,
  onRun,
  onRevert,
  payload,
  revealTarget,
  renderFeedback,
  spanHighlight,
  embedded,
}: {
  step: PipelineStepState
  isRunning: boolean
  isReverting: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
  payload: StoryExtractionReviewPayload
  revealTarget: { stepId: PipelineStepId; epoch: number } | null
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
  spanHighlight?: SpanHighlightProps
  embedded?: boolean
}) {
  const revertible = isStepRevertible(step.id, payload)
  const showRevert = REVERT_SCOPE_STEP_IDS.includes(step.id)

  return (
    <FocusAccordionItem
      value={step.id}
      id={`step-${step.id}`}
      className={cn(
        'scroll-mt-28 rounded-lg border border-subtle px-3 transition-colors',
        embedded && 'bg-surface hover:bg-white'
      )}
    >
      <div className="flex items-center gap-2 py-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger
            className="w-full py-2 hover:bg-transparent hover:no-underline [&>svg]:hidden"
          >
            <div className="flex w-full min-w-0 items-center gap-2 text-left">
              <div className="flex shrink-0 items-center gap-2">
                <PipelineStatusIcon status={isRunning ? 'running' : step.status} />
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
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <StageActionButtons
            stepId={step.id}
            label={step.label}
            runnable={step.runnable}
            revertible={revertible}
            showRevert={showRevert}
            isRunning={isRunning}
            isReverting={isReverting}
            onRun={onRun}
            onRevert={onRevert}
          />
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
  stepIds,
  onRefresh,
  onApproveQa,
  approvingQa,
  headerActions,
  toolbarActions,
  renderFeedback,
  spanHighlight,
  title = 'Pipeline',
  description,
  showBlockedBanner = true,
  showRevertBlockedNotice = true,
  embedded = false,
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
  embedded?: boolean
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
      {(title || description || headerActions || toolbarActions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {title ? <h3 className="font-medium">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {(headerActions || toolbarActions) && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {headerActions}
              {toolbarActions}
            </div>
          )}
        </div>
      )}

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

      <FocusAccordion
        value={actions.expanded}
        onValueChange={actions.setExpanded}
        className="space-y-4"
      >
        {stages.map((stage) => {
          const stageSteps = filteredSteps.filter((s) => s.stageId === stage.id)
          if (stageSteps.length === 0) return null

          const extractionRowProps = {
            isStepRunning: actions.isStepRunning,
            revertingStepId: actions.revertingStepId,
            onRun: actions.runStep,
            onRevert: actions.requestRevert,
            payload,
            revealTarget: actions.revealTarget,
            renderFeedback,
            spanHighlight,
            embedded,
          }

          return (
            <div key={stage.id} className="space-y-2">
              {!stageId && !stepIds?.length && (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {stage.label}
                </h4>
              )}
              {stage.id === 'extraction' ? (
                <ExtractionStageSteps stageSteps={stageSteps} rowProps={extractionRowProps} />
              ) : (
                <div className="space-y-2">
                  {stageSteps.map((step) => (
                    <PipelineStepRow
                      key={step.id}
                      step={step}
                      isRunning={actions.isStepRunning(step.id)}
                      isReverting={actions.revertingStepId === step.id}
                      onRun={actions.runStep}
                      onRevert={actions.requestRevert}
                      payload={payload}
                      revealTarget={actions.revealTarget}
                      renderFeedback={renderFeedback}
                      spanHighlight={spanHighlight}
                      embedded={embedded}
                    />
                  ))}
                </div>
              )}
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
