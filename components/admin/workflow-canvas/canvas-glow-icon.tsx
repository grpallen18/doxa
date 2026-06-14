'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Solid Lucide icon (vs default outline). */
export function filledLucideProps(enabled: boolean) {
  if (!enabled) return {}
  return {
    fill: 'currentColor',
    stroke: 'currentColor',
    strokeWidth: 0,
  }
}

export const ACTION_ICON_GLOW = {
  backScale: 1.85,
  blurPx: 7,
  backOpacity: 0.92,
  outerScale: 2.35,
  outerBlurPx: 12,
  outerOpacity: 0.55,
} as const

export const glowToneClasses = {
  emerald: {
    front: 'text-emerald-300',
    back: 'text-emerald-400',
    outer: 'text-emerald-500',
  },
  rose: {
    front: 'text-rose-300',
    back: 'text-rose-400',
    outer: 'text-rose-500',
  },
} as const

export type GlowTone = keyof typeof glowToneClasses

export function CanvasGlowIcon({
  icon: Icon,
  active,
  tone,
  filled = false,
  size = 'sm',
}: {
  icon: LucideIcon
  active: boolean
  tone: GlowTone
  filled?: boolean
  size?: 'sm' | 'md'
}) {
  const colors = glowToneClasses[tone]
  const glow = ACTION_ICON_GLOW
  const fillProps = filledLucideProps(filled && active)
  const iconSize = size === 'md' ? 'size-5' : 'size-3.5'
  const wrapperSize = size === 'md' ? 'size-6' : 'size-4'

  return (
    <span className={cn('relative inline-flex items-center justify-center', wrapperSize)}>
      {active ? (
        <>
          <Icon
            className={cn('pointer-events-none absolute', iconSize, colors.outer)}
            {...fillProps}
            style={{
              transform: `scale(${glow.outerScale})`,
              filter: `blur(${glow.outerBlurPx}px)`,
              opacity: glow.outerOpacity,
            }}
            aria-hidden
          />
          <Icon
            className={cn('pointer-events-none absolute', iconSize, colors.back)}
            {...fillProps}
            style={{
              transform: `scale(${glow.backScale})`,
              filter: `blur(${glow.blurPx}px)`,
              opacity: glow.backOpacity,
            }}
            aria-hidden
          />
        </>
      ) : null}
      <Icon
        className={cn('relative', iconSize, active ? colors.front : 'text-zinc-500')}
        {...fillProps}
        aria-hidden
      />
    </span>
  )
}
