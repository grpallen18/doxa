'use client'

import * as React from 'react'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, onFocus, onBlur, disabled, ...props }, ref) => {
  const [focused, setFocused] = React.useState(false)

  return (
    <SpotlightBorder active={focused && !disabled}>
      <textarea
        disabled={disabled}
        className={cn(
          'relative flex min-h-[4rem] w-full rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-background px-3 py-2 text-base font-medium text-muted shadow-none transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        {...props}
      />
    </SpotlightBorder>
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
