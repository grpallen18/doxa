'use client'

import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { PipelineStepper } from '@/components/admin/pipeline/pipeline-stepper'
import { cn } from '@/lib/utils'

function anchorToStepId(anchor: string): PipelineStepId | null {
  if (!anchor.startsWith('step-')) return null
  return anchor.slice(5) as PipelineStepId
}

export function LifecyclePath({
  payload,
  runningStepId: _runningStepId,
  onStepSelect,
  className,
}: {
  payload: StoryExtractionReviewPayload
  runningStepId?: PipelineStepId | null
  onStepSelect?: (stepId: PipelineStepId) => void
  className?: string
}) {
  const handleNavigate = (anchor: string) => {
    const stepId = anchorToStepId(anchor)
    if (stepId) onStepSelect?.(stepId)
    const el = document.getElementById(anchor)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      id="lifecycle"
      className={cn('scroll-mt-24 px-4 py-3', className)}
    >
      <PipelineStepper
        payload={payload}
        stageFilter={['ingestion', 'extraction']}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
