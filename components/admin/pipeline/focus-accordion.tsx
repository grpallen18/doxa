'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

type FocusAccordionContextValue = {
  expanded: string[]
}

const FocusAccordionContext = createContext<FocusAccordionContextValue | null>(null)

export function FocusAccordion({
  className,
  value: controlledValue,
  onValueChange: controlledOnChange,
  defaultValue,
  children,
}: {
  className?: string
  value?: string[]
  onValueChange?: (value: string[]) => void
  defaultValue?: string[]
  children: ReactNode
}) {
  const [internalValue, setInternalValue] = useState<string[]>(defaultValue ?? [])
  const expanded = controlledValue ?? internalValue
  const onValueChange = controlledOnChange ?? setInternalValue

  return (
    <FocusAccordionContext.Provider value={{ expanded }}>
      <Accordion
        type="multiple"
        className={className}
        value={expanded}
        onValueChange={onValueChange}
      >
        {children}
      </Accordion>
    </FocusAccordionContext.Provider>
  )
}

export function FocusAccordionItem({
  className,
  value,
  ...props
}: React.ComponentProps<typeof AccordionItem>) {
  const context = useContext(FocusAccordionContext)
  const dimmed =
    context != null && context.expanded.length > 0 && !context.expanded.includes(value)

  return (
    <AccordionItem
      {...props}
      value={value}
      className={cn('transition-opacity duration-200', dimmed && 'opacity-40', className)}
    />
  )
}

export { AccordionContent, AccordionTrigger }
