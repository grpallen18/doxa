'use client'

import * as React from 'react'
import { Spotlight } from '@/components/motion-primitives/spotlight'
import { cn } from '@/lib/utils'

const SPOTLIGHT_SPRING = { stiffness: 450, damping: 35, bounce: 0 } as const

type SpotlightBorderProps = {
  children: React.ReactNode
  className?: string
  active?: boolean
  size?: number
}

/** 1px accent spotlight border (Motion Primitives Spotlight pattern). */
export function SpotlightBorder({
  children,
  className,
  active = false,
  size = 160,
}: SpotlightBorderProps) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-md bg-border p-px',
        className
      )}
    >
      <Spotlight
        size={size}
        springOptions={SPOTLIGHT_SPRING}
        className={cn(
          'blur-2xl from-[color-mix(in_srgb,var(--accent-primary)_85%,white)] via-[var(--accent-primary)] to-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)]',
          active ? '!opacity-100' : '!opacity-0'
        )}
      />
      {children}
    </div>
  )
}
