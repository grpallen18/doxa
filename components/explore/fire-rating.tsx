'use client'

import { cn } from '@/lib/utils'

const LABELS = ['Quiet', 'Warm', 'Active', 'Heated', 'Flashpoint'] as const

export function FireRating({
  rating,
  className,
}: {
  rating: number
  className?: string
}) {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)))
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1" aria-label={`Fire rating ${clamped} of 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'text-sm leading-none',
              i < clamped ? 'text-accent-primary opacity-100' : 'text-muted opacity-30'
            )}
            aria-hidden
          >
            ▲
          </span>
        ))}
      </div>
      <p className="text-xs text-muted">{LABELS[clamped - 1]}</p>
    </div>
  )
}
