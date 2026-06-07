'use client'

import Link from 'next/link'
import { Bot } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { cn } from '@/lib/utils'

export function AgentIconButton({
  stepId,
  manifestStatus,
  inactiveNote,
  className,
}: {
  stepId: PipelineStepId
  manifestStatus: string
  inactiveNote?: string | null
  className?: string
}) {
  const isActive = manifestStatus === 'active'

  return (
    <Link
      href={`/admin/agents/${stepId}`}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80',
        isActive
          ? 'bg-[var(--pipeline-step-complete-bg)] text-[var(--pipeline-step-complete-fg)]'
          : 'bg-destructive text-destructive-foreground',
        className
      )}
      title={
        isActive
          ? `Agent: ${stepId} (active)`
          : (inactiveNote ?? `Agent: ${stepId} (inactive)`)
      }
      aria-label={`View agent ${stepId}`}
    >
      <Bot className="size-3" aria-hidden />
    </Link>
  )
}
