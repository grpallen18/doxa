'use client'

import { useMemo } from 'react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import { LIFECYCLE_PHASES, STORY_LIFECYCLE_STEP_IDS } from '@/lib/admin/story-lifecycle'
import { LifecycleStage } from '@/components/admin/record/lifecycle-stage'
import {
  PipelineStepNode,
  pipelineNodeTrackClass,
} from '@/components/admin/pipeline/pipeline-step-node'
import { cn } from '@/lib/utils'

export function LifecyclePath({
  payload,
  runningStepId,
  onStepSelect,
  className,
}: {
  payload: StoryExtractionReviewPayload
  runningStepId?: PipelineStepId | null
  onStepSelect?: (stepId: PipelineStepId) => void
  className?: string
}) {
  const checklist = useMemo(() => derivePipelineChecklist(payload), [payload])
  const steps = useMemo(
    () =>
      STORY_LIFECYCLE_STEP_IDS.map((id) => checklist.steps.find((s) => s.id === id)).filter(
        (s): s is NonNullable<typeof s> => s != null
      ),
    [checklist.steps]
  )

  const progressEnd = useMemo(() => {
    let end = -1
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i].status
      if (
        s === 'complete' ||
        s === 'optional' ||
        s === 'blocked' ||
        s === 'current' ||
        runningStepId === steps[i].id
      ) {
        end = i
      }
    }
    return end
  }, [steps, runningStepId])

  const scrollToStep = (stepId: PipelineStepId) => {
    onStepSelect?.(stepId)
    const el = document.getElementById(`step-${stepId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <nav
      id="lifecycle"
      aria-label="Story lifecycle"
      className={cn('scroll-mt-24 rounded-lg border border-subtle bg-card px-3 py-3', className)}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Story lifecycle
      </p>
      <div className="overflow-x-auto pb-1">
        {LIFECYCLE_PHASES.map((phase) => {
          const phaseSteps = steps.filter((s) => phase.stepIds.includes(s.id))
          if (phaseSteps.length === 0) return null

          return (
            <div key={phase.id} className="mb-3 last:mb-0">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {phase.label}
              </p>
              <div className="relative flex min-w-max items-start gap-0">
                {phaseSteps.map((step, index) => {
                  const globalIndex = steps.findIndex((s) => s.id === step.id)
                  const leftFilled = globalIndex > 0 && globalIndex <= progressEnd
                  const rightFilled =
                    globalIndex < steps.length - 1 && globalIndex < progressEnd

                  return (
                    <div key={step.id} className="relative flex items-start">
                      {index > 0 && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -left-3 top-3.5 h-0.5 w-6 -translate-y-1/2',
                            pipelineNodeTrackClass(leftFilled ? 'complete' : 'pending')
                          )}
                        />
                      )}
                      {index < phaseSteps.length - 1 && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-[calc(100%-0.75rem)] top-3.5 h-0.5 w-6 -translate-y-1/2',
                            pipelineNodeTrackClass(rightFilled ? 'complete' : 'pending')
                          )}
                        />
                      )}
                      <LifecycleStage
                        step={step}
                        isRunning={runningStepId === step.id}
                        onSelect={scrollToStep}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted">
        <span className="inline-flex items-center gap-1">
          <PipelineStepNode status="complete" size="substage" />
          Complete
        </span>
        <span className="inline-flex items-center gap-1">
          <PipelineStepNode status="current" size="substage" />
          Running / current
        </span>
        <span className="inline-flex items-center gap-1">
          <PipelineStepNode status="pending" size="substage" />
          Pending
        </span>
      </div>
    </nav>
  )
}
