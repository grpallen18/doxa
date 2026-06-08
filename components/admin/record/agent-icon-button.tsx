'use client'

import Link from 'next/link'
import { Bot } from 'lucide-react'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { cn } from '@/lib/utils'

export function AgentIconButton({
  stepId,
  manifestStatus,
  inactiveNote,
  variant = 'prominent',
  className,
}: {
  stepId: PipelineStepId
  manifestStatus: string
  inactiveNote?: string | null
  variant?: 'prominent' | 'subtle'
  className?: string
}) {
  const isActive = manifestStatus === 'active'

  if (variant === 'subtle') {
    return (
      <Link
        href={`/admin/agents/${stepId}`}
        className={cn(
          'inline-flex size-3.5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground',
          !isActive && 'text-destructive/60 hover:text-destructive',
          className
        )}
        title={
          isActive
            ? `Agent: ${stepId} (active)`
            : (inactiveNote ?? `Agent: ${stepId} (inactive)`)
        }
        aria-label={`View agent ${stepId}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Bot className="size-2.5" aria-hidden />
      </Link>
    )
  }

  return (
    <Link
      href={`/admin/agents/${stepId}`}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80',
        isActive
          ? 'bg-[var(--agent-icon-active-bg)] text-[var(--agent-icon-active-fg)]'
          : 'bg-[var(--agent-icon-inactive-bg)] text-[var(--agent-icon-inactive-fg)]',
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
