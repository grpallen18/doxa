'use client'

import { Bot, User } from 'lucide-react'
import type { VisionNodeSpec } from '@/lib/admin/workflow-canvas/types'
import { CloudflareIcon } from '@/components/icons/cloudflare-icon'
import { cn } from '@/lib/utils'

export type StepIconVariant = 'bot' | 'human' | 'cloud'

export function resolveStepIconVariant(
  spec: VisionNodeSpec | undefined
): StepIconVariant {
  if (!spec) return 'bot'
  if (spec.iconVariant) return spec.iconVariant
  if (spec.catalogStepId === 'review-pending-stories') return 'human'
  return 'bot'
}

function stepIconAccentClass(variant: StepIconVariant): string {
  if (variant === 'cloud') return 'text-orange-400'
  if (variant === 'human') return 'text-orange-400'
  return 'text-indigo-400'
}

/** Fixed square footprint for canvas step headers (bot shell and cloud icon). */
const CANVAS_STEP_ICON_SHELL = 'flex size-7 shrink-0 items-center justify-center rounded-md'

export function CanvasStepIconAvatar({
  variant,
  className,
}: {
  variant: StepIconVariant
  className?: string
}) {
  if (variant === 'cloud') {
    return (
      <CloudflareIcon
        size={28}
        className={cn(CANVAS_STEP_ICON_SHELL, 'overflow-hidden object-cover', className)}
      />
    )
  }

  const Icon = variant === 'human' ? User : Bot

  return (
    <div
      className={cn(
        CANVAS_STEP_ICON_SHELL,
        'border border-white/10 bg-white/5',
        stepIconAccentClass(variant),
        className
      )}
    >
      <Icon className="size-4" />
    </div>
  )
}
