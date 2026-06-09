'use client'

import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  isStepRevertible,
  type PipelineStepState,
} from '@/lib/admin/story-pipeline-checklist'
import { FlowAgentIcon } from '@/components/admin/pipeline/pipeline-flow-agent-icon'
import { StageActionButtons } from '@/components/admin/record/stage-action-buttons'
import { getFlowNodeLabel } from '@/lib/admin/pipeline-flow-labels'
import { cn } from '@/lib/utils'

function isFlowStepComplete(status: PipelineStepState['status']): boolean {
  return status === 'complete' || status === 'optional'
}

export function PipelineFlowNode({
  step,
  payload,
  isRunning,
  isReverting,
  isBusy,
  onRun,
  onRevert,
}: {
  step: PipelineStepState
  payload: StoryExtractionReviewPayload
  isRunning: boolean
  isReverting: boolean
  isBusy: boolean
  onRun: (stepId: PipelineStepId) => void
  onRevert: (stepId: PipelineStepId) => void
}) {
  const revertible = isStepRevertible(step.id, payload)
  const stepComplete = isFlowStepComplete(step.status)
  const label = getFlowNodeLabel(step.id, step.label)

  return (
    <div
      id={`step-${step.id}`}
      className="scroll-mt-28 flex w-max max-w-full items-center gap-x-2 py-0.5"
    >
      <FlowAgentIcon
        stepId={step.id}
        agentLabel={step.label}
        payload={payload}
        manifestStatus={step.manifestStatus}
        inactiveNote={step.inactiveNote}
        stepComplete={stepComplete}
        isRunning={isRunning || isReverting}
        className={cn(
          step.status === 'current' &&
            !stepComplete &&
            'ring-2 ring-[var(--pipeline-step-current-bg)]/50 ring-offset-1 ring-offset-surface',
          step.status === 'blocked' &&
            !stepComplete &&
            'ring-2 ring-destructive/40 ring-offset-1 ring-offset-surface'
        )}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <StageActionButtons
          stepId={step.id}
          label={label}
          runnable={step.runnable}
          revertible={revertible}
          showRevert
          isRunning={isRunning}
          isReverting={isReverting}
          isBusy={isBusy}
          onRun={onRun}
          onRevert={onRevert}
          compact
        />
        <p className="whitespace-nowrap text-xs font-medium leading-none">{label}</p>
      </div>
    </div>
  )
}
