export type RunnableNodeHighlightTone = 'green' | 'cyan'

export const RUNNABLE_NODE_HIGHLIGHT = {
  green: {
    borderClass: 'border-emerald-500/70',
    boxShadow:
      '0 0 20px rgba(16, 185, 129, 0.45), 0 0 40px rgba(16, 185, 129, 0.2), inset 0 0 0 1px rgba(52, 211, 153, 0.15)',
  },
  cyan: {
    borderClass: 'border-cyan-400/80',
    boxShadow:
      '0 0 20px rgba(34, 211, 238, 0.5), 0 0 40px rgba(34, 211, 238, 0.25), inset 0 0 0 1px rgba(34, 211, 238, 0.2)',
  },
} as const

export function resolveRunnableHighlightTone(
  canRun: boolean,
  isHoveredFromList: boolean
): RunnableNodeHighlightTone | null {
  if (!canRun) return null
  return isHoveredFromList ? 'cyan' : 'green'
}

export function runnableHighlightClasses(tone: RunnableNodeHighlightTone | null): {
  borderClass?: string
  boxShadow?: string
} {
  if (!tone) return {}
  const highlight = RUNNABLE_NODE_HIGHLIGHT[tone]
  return {
    borderClass: highlight.borderClass,
    boxShadow: highlight.boxShadow,
  }
}
