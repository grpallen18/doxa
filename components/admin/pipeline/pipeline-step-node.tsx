import { Check, Loader2, Minus } from 'lucide-react'
import type { PipelineStepStatus } from '@/lib/admin/pipeline-status'
import type { StageSummaryStatus } from '@/lib/admin/pipeline-status'
import { cn } from '@/lib/utils'

export type PipelineStepNodeStatus = StageSummaryStatus | PipelineStepStatus

const statusClass: Record<StageSummaryStatus, string> = {
  complete: 'pipeline-step-node--complete',
  current: 'pipeline-step-node--current',
  pending: 'pipeline-step-node--pending',
  blocked: 'pipeline-step-node--blocked',
}

function resolveStatusClass(status: PipelineStepNodeStatus): string {
  if (status === 'optional') return statusClass.complete
  return statusClass[status]
}

export function PipelineStepNode({
  status,
  active = false,
  size = 'stage',
}: {
  status: PipelineStepNodeStatus
  active?: boolean
  size?: 'stage' | 'substage'
}) {
  const iconClass = size === 'substage' ? 'size-2 stroke-[2.5]' : 'size-3.5 stroke-[2.5]'

  return (
    <div
      className={cn(
        'pipeline-step-node',
        resolveStatusClass(status),
        size === 'substage' && 'pipeline-step-node--substage',
        active && 'pipeline-step-node--active'
      )}
      aria-hidden
    >
      {status === 'complete' && <Check className={iconClass} aria-hidden />}
      {status === 'optional' && <Minus className={iconClass} aria-hidden />}
      {status === 'current' && <Loader2 className={cn(iconClass, 'animate-spin')} aria-hidden />}
    </div>
  )
}

export function pipelineNodeTrackClass(
  segmentStatus: StageSummaryStatus | PipelineStepStatus
): string {
  if (
    segmentStatus === 'complete' ||
    segmentStatus === 'optional' ||
    segmentStatus === 'current'
  ) {
    return 'pipeline-step-track--complete'
  }
  if (segmentStatus === 'blocked') return 'pipeline-step-track--blocked'
  return 'pipeline-step-track--muted'
}
