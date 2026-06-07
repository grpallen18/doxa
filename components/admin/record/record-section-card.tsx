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
  description,
  children,
  defaultOpen = true,
  forceOpen,
  className,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  return (
    <Collapsible
      id={id}
      open={open}
      onOpenChange={setOpen}
      className={cn('scroll-mt-24 rounded-lg border border-subtle bg-card', className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-subtle px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}
