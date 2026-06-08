import { Check, Circle, Loader2, Minus, XCircle } from 'lucide-react'
import type { PipelineStepStatus } from '@/lib/admin/story-pipeline-checklist'
import { cn } from '@/lib/utils'

export function PipelineStatusIcon({
  status,
  size = 'md',
}: {
  status: PipelineStepStatus
  size?: 'sm' | 'md'
}) {
  const iconClass = size === 'sm' ? 'size-3' : 'size-4'

  switch (status) {
    case 'complete':
      return (
        <Check
          className={cn('shrink-0 text-[var(--agent-icon-active-fg)]', iconClass)}
          aria-hidden
        />
      )
    case 'blocked':
      return (
        <XCircle className={cn('shrink-0 text-destructive', iconClass)} aria-hidden />
      )
    case 'optional':
      return <Minus className={cn('shrink-0 text-muted', iconClass)} aria-hidden />
    case 'running':
      return (
        <Loader2
          className={cn('shrink-0 animate-spin text-[var(--pipeline-step-current-bg)]', iconClass)}
          aria-hidden
        />
      )
    case 'current':
    default:
      return <Circle className={cn('shrink-0 text-muted/60', iconClass)} aria-hidden />
  }
}
