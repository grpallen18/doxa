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
          ? 'bg-surface'
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
            'flex w-full min-w-0 items-center gap-2 px-4 py-1.5 text-left transition-colors'
          )}
        >
          <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight sm:text-base">{title}</h2>
          {headerActions ? (
            <div
              className="flex shrink-0 items-center gap-1"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {headerActions}
            </div>
          ) : null}
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-[var(--record-section-header-fg)]/80 transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="bg-surface">
        <div className="min-h-0 px-5 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
