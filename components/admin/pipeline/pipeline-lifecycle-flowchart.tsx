'use client'

import { Fragment, useMemo, type ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
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
import { FlowConnector, FLOW_PARALLEL_GRID_CLASS } from '@/components/admin/pipeline/pipeline-flow-connector'
import { PipelineFlowPlaceholderNode } from '@/components/admin/pipeline/pipeline-flow-placeholder-node'
import { PipelineFlowNode } from '@/components/admin/pipeline/pipeline-flow-node'
import { isFlowPlaceholderStep, LIFECYCLE_FLOW_ROWS } from '@/lib/admin/pipeline-flow-layout'
import type { FlowChartStepId } from '@/lib/admin/pipeline-flow-layout'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  derivePipelineChecklist,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import type { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'

export function PipelineLifecycleFlowchart({
  payload,
  pipelineActions,
  onApproveQa,
  approvingQa,
}: {
  payload: StoryExtractionReviewPayload
  pipelineActions: ReturnType<typeof useStoryPipelineActions>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
}) {
  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const stepById = useMemo(() => {
    const map = new Map<PipelineStepId, PipelineStepState>()
    for (const step of checklist.steps) map.set(step.id, step)
    return map
  }, [checklist.steps])

  const nodeProps = {
    payload,
    onRun: pipelineActions.runStep,
    onRevert: pipelineActions.requestRevert,
  }

  function renderStep(stepId: PipelineStepId) {
    const step = stepById.get(stepId)
    if (!step) return null
    return (
      <PipelineFlowNode
        key={stepId}
        step={step}
        isRunning={pipelineActions.isStepRunning(stepId)}
        isReverting={pipelineActions.revertingStepId === stepId}
        {...nodeProps}
      />
    )
  }

  function renderFlowStep(stepId: FlowChartStepId) {
    if (isFlowPlaceholderStep(stepId)) {
      return <PipelineFlowPlaceholderNode key={stepId} stepId={stepId} />
    }
    return renderStep(stepId)
  }

  return (
    <div className="space-y-0 text-sm">
      {checklist.isPipelineBlocked && checklist.blockedReason ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p className="min-w-0">{checklist.blockedReason}</p>
          <button
            type="button"
            className="shrink-0 font-medium text-primary underline underline-offset-4 hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50"
            disabled={approvingQa}
            onClick={() => void onApproveQa()}
          >
            {approvingQa ? 'Approving…' : 'Approve QA'}
          </button>
        </div>
      ) : null}

      <div className="flex w-fit max-w-full flex-col">
        {(() => {
          const elements: ReactNode[] = []

          for (let rowIndex = 0; rowIndex < LIFECYCLE_FLOW_ROWS.length; rowIndex++) {
            const row = LIFECYCLE_FLOW_ROWS[rowIndex]
            const showLeadingConnector = rowIndex > 0

            if (row.kind === 'parallel') {
              const dualTrunkRow = LIFECYCLE_FLOW_ROWS[rowIndex + 1]
              const validateRow = LIFECYCLE_FLOW_ROWS[rowIndex + 2]
              const dualTrunk = dualTrunkRow?.kind === 'dual-trunk' ? dualTrunkRow : null
              const validateStep =
                validateRow?.kind === 'step' &&
                validateRow.stepId === 'validate-merged-extraction'
                  ? validateRow.stepId
                  : null

              elements.push(
                <div key="lanes-block" className={FLOW_PARALLEL_GRID_CLASS}>
                  {showLeadingConnector ? <FlowConnector variant="fork" /> : null}
                  {row.lanes.map((lane) => (
                    <div key={lane.id} className="min-w-0 space-y-0">
                      <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {lane.label}
                      </p>
                      {lane.stepIds.map((stepId, stepIndex) => (
                        <div key={stepId}>
                          {stepIndex > 0 ? <FlowConnector /> : null}
                          {renderStep(stepId)}
                        </div>
                      ))}
                    </div>
                  ))}
                  {dualTrunk ? (
                    <>
                      {dualTrunk.lanes[0]?.stepIds.map((_, stepIndex) => (
                        <Fragment key={`merge-qa-${stepIndex}`}>
                          <FlowConnector variant="dual-vertical" />
                          {dualTrunk.lanes.map((lane) => (
                            <div key={`${lane.id}-${lane.stepIds[stepIndex]}`}>
                              {renderFlowStep(lane.stepIds[stepIndex])}
                            </div>
                          ))}
                        </Fragment>
                      ))}
                    </>
                  ) : null}
                  {validateStep ? (
                    <>
                      <FlowConnector variant="join" />
                      <div className="col-span-2">{renderStep(validateStep)}</div>
                    </>
                  ) : null}
                </div>
              )

              if (dualTrunk) rowIndex++
              if (validateStep) rowIndex++
              continue
            }

            if (row.kind === 'dual-trunk') continue
            if (row.kind === 'step' && row.stepId === 'validate-merged-extraction') continue

            if (row.kind === 'step') {
              elements.push(
                <div key={row.stepId}>
                  {showLeadingConnector ? <FlowConnector /> : null}
                  {renderStep(row.stepId)}
                </div>
              )
            }
          }

          return elements
        })()}
      </div>

      <AlertDialog
        open={pipelineActions.revertTarget != null}
        onOpenChange={(open) => {
          if (!open) pipelineActions.cancelRevert()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert this step?</AlertDialogTitle>
            <AlertDialogDescription>
              {pipelineActions.revertTarget
                ? pipelineActions.getRevertStepDescription(pipelineActions.revertTarget)
                : 'This will undo the latest completed step.'}{' '}
              Only the latest completed step can be reverted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pipelineActions.revertingStepId != null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={
                pipelineActions.revertingStepId != null || pipelineActions.revertTarget == null
              }
              onClick={(e) => {
                e.preventDefault()
                pipelineActions.confirmRevert()
              }}
            >
              {pipelineActions.revertingStepId != null ? 'Reverting…' : 'Confirm revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
