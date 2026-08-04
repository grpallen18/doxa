import type { NodeHoverDrawingFunction } from 'sigma/rendering'
import { drawDiscNodeLabel } from 'sigma/rendering'
import { NEO_LABEL_COLOR_EMPHASIS } from '@/lib/admin/neo-graph/appearance'
import {
  deriveNeoBorderColor,
  deriveNeoHighlightColor,
} from '@/lib/admin/neo-graph/colors'
import type { NeoHoverFadeController } from '@/lib/admin/neo-graph/hover-fade'

/** Hover label uses app --foreground (no chip background). */
export function resolveNeoHoverLabelColor(): string {
  if (typeof window === 'undefined') return NEO_LABEL_COLOR_EMPHASIS
  const foreground = getComputedStyle(document.documentElement)
    .getPropertyValue('--foreground')
    .trim()
  return foreground || NEO_LABEL_COLOR_EMPHASIS
}

type HoverDrawData = Parameters<NodeHoverDrawingFunction>[1]
type HoverDrawSettings = Parameters<NodeHoverDrawingFunction>[2]

function fillNeoDisc(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  const lift = deriveNeoHighlightColor(color, 0.42)
  const rim = deriveNeoBorderColor(color, 0.48)
  const gradient = context.createRadialGradient(
    x - radius * 0.32,
    y - radius * 0.38,
    radius * 0.05,
    x,
    y,
    radius
  )
  gradient.addColorStop(0, lift)
  gradient.addColorStop(0.45, color)
  gradient.addColorStop(0.82, rim)
  gradient.addColorStop(1, deriveNeoBorderColor(color, 0.36))

  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = gradient
  context.fill()

  // Soft specular glint (matches WebGL shine)
  const shine = context.createRadialGradient(
    x - radius * 0.32,
    y - radius * 0.38,
    0,
    x - radius * 0.32,
    y - radius * 0.38,
    radius * 0.55
  )
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.34)')
  shine.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)')
  shine.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fillStyle = shine
  context.fill()
}

/**
 * Hover: dense node-colored glow (no white border/chip) + foreground label.
 * `opacity` fades glow + label (legend-matched 300ms ease-out when animated).
 */
export function drawNeoNodeHoverAt(
  context: CanvasRenderingContext2D,
  data: HoverDrawData,
  settings: HoverDrawSettings,
  opacity: number
): void {
  if (opacity <= 0.001) return

  const color = typeof data.color === 'string' && data.color ? data.color : '#e8e4df'
  const radius = data.size
  const alpha = Math.max(0, Math.min(1, opacity))

  context.save()
  context.globalAlpha = alpha

  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 5
  context.shadowColor = color
  fillNeoDisc(context, data.x, data.y, radius, color)

  context.shadowBlur = 0
  context.beginPath()
  context.arc(data.x, data.y, radius, 0, Math.PI * 2)
  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 1
  context.stroke()

  const hoverSettings = {
    ...settings,
    labelColor: { color: resolveNeoHoverLabelColor() },
  }
  drawDiscNodeLabel(context, data, hoverSettings)
  context.restore()
}

/** Full-opacity hover (selection highlight / no fade controller). */
export const drawNeoNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  drawNeoNodeHoverAt(context, data, settings, 1)
}

/**
 * Sigma hover drawer bound to a fade controller.
 * Live/lingering hover uses fade progress; other highlighted nodes (e.g. selection) stay solid.
 */
export function createFadedNeoNodeHover(
  getFade: () => NeoHoverFadeController | null,
  getSolidNodeId?: () => string | null
): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const fade = getFade()
    const key = typeof data.key === 'string' ? data.key : null
    let opacity = 1
    if (fade && key && key === fade.getNodeId()) {
      const solid = getSolidNodeId?.() === key
      // Selection owns solid hover chrome after leave; only fade non-selected linger.
      if (fade.isLive() || (fade.isLingering() && !solid)) {
        opacity = fade.getProgress()
      }
    }
    drawNeoNodeHoverAt(context, data, settings, opacity)
  }
}
