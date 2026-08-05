'use client'

import * as React from 'react'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onFocus, onBlur, disabled, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false)

    return (
      <SpotlightBorder active={focused && !disabled}>
        <input
          type={type}
          disabled={disabled}
          className={cn(
            'relative flex h-9 w-full rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-background px-3 py-1 text-base font-medium text-muted shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
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
  }
)
Input.displayName = 'Input'

export { Input }
