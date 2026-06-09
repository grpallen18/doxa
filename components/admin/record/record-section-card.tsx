'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function RecordSectionCard({
  id,
  title,
  children,
  defaultOpen = true,
  forceOpen,
  variant = 'card',
  className,
  headerActions,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
  variant?: 'card' | 'panel'
  className?: string
  headerActions?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const isPanel = variant === 'panel'

  return (
    <Collapsible
      id={id}
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'scroll-mt-24',
        isPanel
          ? 'overflow-hidden rounded-lg border border-subtle bg-surface-soft'
          : 'overflow-hidden rounded-lg border border-subtle bg-card shadow-sm',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b border-[var(--record-section-header-border)] bg-[var(--record-section-header-bg)] text-[var(--record-section-header-fg)]',
          'data-[state=open]:border-[var(--record-section-header-border)]'
        )}
      >
        <CollapsibleTrigger
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-4 text-left transition-colors',
            headerActions ? 'pr-2' : 'pr-4'
          )}
        >
          <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight sm:text-base">{title}</h2>
          {!headerActions ? (
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-[var(--record-section-header-fg)]/80 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          ) : null}
        </CollapsibleTrigger>
        {headerActions ? (
          <div className="flex shrink-0 items-center gap-1 py-1.5">{headerActions}</div>
        ) : null}
        {headerActions ? (
          <CollapsibleTrigger className="flex shrink-0 items-center py-1.5 pr-4 pl-1 transition-colors">
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-[var(--record-section-header-fg)]/80 transition-transform',
                open && 'rotate-180'
              )}
              aria-hidden
            />
          </CollapsibleTrigger>
        ) : null}
      </div>
      <CollapsibleContent className={isPanel ? 'bg-surface-soft' : 'bg-surface'}>
        <div className="min-h-0 px-5 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
