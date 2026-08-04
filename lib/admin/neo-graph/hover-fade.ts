/** Matches legend swatch `duration-300 ease-out`. */
export const NEO_HOVER_FADE_MS = 300

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export type NeoHoverFadeEnterOptions = {
  /** When switching targets, keep current progress (selection focus changes). */
  preserveProgress?: boolean
}

export type NeoHoverFadeController = {
  getNodeId: () => string | null
  getProgress: () => number
  isLive: () => boolean
  /** True while a fade-out should keep the node on Sigma's hover layer. */
  isLingering: () => boolean
  enter: (
    nodeId: string,
    onTick: () => void,
    opts?: NeoHoverFadeEnterOptions
  ) => void
  leave: (onTick: () => void) => void
  dispose: () => void
}

/**
 * Animates hover progress 0↔1 over 300ms with CSS-like ease-out.
 * Callers must refresh Sigma (or redraw hover) from `onTick`.
 */
export function createNeoHoverFade(): NeoHoverFadeController {
  let nodeId: string | null = null
  let progress = 0
  let live = false
  let raf: number | null = null
  let from = 0
  let to = 0
  let startedAt = 0
  let tick: (() => void) | null = null

  const stopRaf = () => {
    if (raf != null) {
      cancelAnimationFrame(raf)
      raf = null
    }
  }

  const step = (now: number) => {
    const elapsed = now - startedAt
    const t = Math.min(1, elapsed / NEO_HOVER_FADE_MS)
    progress = from + (to - from) * easeOutCubic(t)
    if (t < 1) {
      tick?.()
      raf = requestAnimationFrame(step)
      return
    }
    raf = null
    progress = to
    if (progress <= 0 && !live) {
      nodeId = null
    }
    // Final tick after nodeId cleared so reducer can drop highlighted.
    tick?.()
  }

  const animateTo = (next: number, onTick: () => void) => {
    tick = onTick
    from = progress
    to = next
    startedAt = performance.now()
    stopRaf()
    raf = requestAnimationFrame(step)
  }

  return {
    getNodeId: () => nodeId,
    getProgress: () => progress,
    isLive: () => live,
    isLingering: () => !live && nodeId != null && progress > 0,
    enter: (id, onTick, opts) => {
      live = true
      if (nodeId !== id) {
        nodeId = id
        if (!opts?.preserveProgress) progress = 0
      }
      animateTo(1, onTick)
    },
    leave: (onTick) => {
      live = false
      if (!nodeId || progress <= 0) {
        progress = 0
        nodeId = null
        stopRaf()
        onTick()
        return
      }
      // Keep current progress; animate down without resetting to 1.
      animateTo(0, onTick)
    },
    dispose: () => {
      stopRaf()
      tick = null
      nodeId = null
      progress = 0
      live = false
    },
  }
}
