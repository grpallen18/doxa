import type { NodeHoverDrawingFunction } from 'sigma/rendering'
import { drawDiscNodeLabel } from 'sigma/rendering'

/** Resolve Doxa --inverted for text on Sigma's white hover chip. */
export function resolveNeoHoverLabelColor(): string {
  if (typeof window === 'undefined') return '#000000'
  const root = document.documentElement
  const inverted = getComputedStyle(root).getPropertyValue('--inverted').trim()
  if (!inverted) return '#000000'
  // Light theme sets --inverted to white (text on dark fills); that fails on a
  // white hover chip — fall back to --foreground.
  if (isLightCssColor(inverted)) {
    return getComputedStyle(root).getPropertyValue('--foreground').trim() || '#000000'
  }
  return inverted
}

function isLightCssColor(color: string): boolean {
  const hex = color.trim()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex
    const r = parseInt(full.slice(1, 3), 16)
    const g = parseInt(full.slice(3, 5), 16)
    const b = parseInt(full.slice(5, 7), 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 180
  }
  return false
}

/**
 * Sigma default hover draws a white label chip then reuses idle labelColor.
 * Override so hover text uses --inverted (dark text on the white chip).
 */
export const drawNeoNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  const size = settings.labelSize
  const font = settings.labelFont
  const weight = settings.labelWeight
  context.font = `${weight} ${size}px ${font}`

  context.fillStyle = '#FFF'
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 8
  context.shadowColor = '#000'
  const PADDING = 2

  if (typeof data.label === 'string') {
    const textWidth = context.measureText(data.label).width
    const boxWidth = Math.round(textWidth + 5)
    const boxHeight = Math.round(size + 2 * PADDING)
    const radius = Math.max(data.size, size / 2) + PADDING
    const angleRadian = Math.asin(boxHeight / 2 / radius)
    const xDeltaCoord = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2))

    context.beginPath()
    context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2)
    context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2)
    context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2)
    context.arc(data.x, data.y, radius, angleRadian, -angleRadian)
    context.closePath()
    context.fill()
  } else {
    context.beginPath()
    context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2)
    context.closePath()
    context.fill()
  }

  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.shadowBlur = 0

  const hoverSettings = {
    ...settings,
    labelColor: { color: resolveNeoHoverLabelColor() },
  }
  drawDiscNodeLabel(context, data, hoverSettings)
}
