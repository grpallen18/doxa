import type Sigma from 'sigma'
import { getNeoKindColor, withHexAlpha } from '@/lib/admin/neo-graph/colors'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'
import type { NeoLodLevel } from '@/lib/admin/neo-graph/lod'

const OVERLAY_ATTR = 'data-neo-envelope-layer'

/** Ensure a pointer-transparent canvas sits under Sigma's mouse layer. */
export function ensureEnvelopeOverlay(
  sigma: Sigma
): HTMLCanvasElement | null {
  const container = sigma.getContainer()
  if (!container) return null

  let canvas = container.querySelector(
    `canvas[${OVERLAY_ATTR}]`
  ) as HTMLCanvasElement | null
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.setAttribute(OVERLAY_ATTR, '1')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '0'
    // Insert before the first sigma canvas so nodes/edges paint above.
    const first = container.querySelector('canvas')
    if (first?.parentElement === container) {
      container.insertBefore(canvas, first)
    } else {
      container.appendChild(canvas)
    }
  }

  const { width, height } = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.floor(width * dpr))
  const h = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return canvas
}

/**
 * Draw soft document envelopes (mid zoom) in graph→viewport pixels.
 */
export function drawDocumentEnvelopes(
  sigma: Sigma,
  level: NeoLodLevel
): void {
  const canvas = ensureEnvelopeOverlay(sigma)
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const { width, height } = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, width, height)

  if (level !== 'mid') return

  const graph = sigma.getGraph() as NeoSigmaGraph
  const fill = withHexAlpha(getNeoKindColor('document'), 0.2)

  graph.forEachNode((id, attrs) => {
    if (attrs.kind !== 'document') return
    if (attrs.lodHidden) return
    const radius = attrs.envelopeRadius
    if (typeof radius !== 'number' || radius <= 0) return

    try {
      const center = sigma.graphToViewport({ x: attrs.x, y: attrs.y })
      const edge = sigma.graphToViewport({
        x: attrs.x + radius,
        y: attrs.y,
      })
      const pixelR = Math.hypot(edge.x - center.x, edge.y - center.y)
      if (!Number.isFinite(pixelR) || pixelR < 2) return

      ctx.beginPath()
      ctx.arc(center.x, center.y, pixelR, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    } catch {
      /* node may lack display data mid-transition */
      void id
    }
  })
}
