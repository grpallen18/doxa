import { Check, Circle, Minus, XCircle } from 'lucide-react'
import type { PipelineStepStatus } from '@/lib/admin/story-pipeline-checklist'

export function PipelineStatusIcon({ status }: { status: PipelineStepStatus }) {
  switch (status) {
    case 'complete':
      return (
        <Check
          className="size-4 shrink-0 text-[var(--pipeline-step-complete-bg)]"
          aria-hidden
        />
      )
    case 'blocked':
      return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
    case 'optional':
      return <Minus className="size-4 shrink-0 text-muted" aria-hidden />
    case 'current':
      return (
        <Circle
          className="size-4 shrink-0 fill-[var(--pipeline-step-complete-bg)] text-[var(--pipeline-step-complete-bg)]"
          aria-hidden
        />
      )
    default:
      return <Circle className="size-4 shrink-0 text-muted" aria-hidden />
  }
}
