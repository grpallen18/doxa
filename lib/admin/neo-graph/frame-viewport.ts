import type { Sigma } from 'sigma'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'

/**
 * Frame the full (visible) graph in the Sigma viewport.
 * Camera operates in Sigma's framed space: {0.5,0.5,ratio:1} shows the bbox.
 */
export function frameGraphInViewport(
  sigma: Sigma,
  options?: { animateMs?: number }
): void {
  try {
    const graph = sigma.getGraph() as NeoSigmaGraph
    let visible = 0
    graph.forEachNode((_id, attrs) => {
      if (attrs.hidden || attrs.lodHidden) return
      visible += 1
    })
    if (visible === 0) return

    const { width, height } = sigma.getDimensions()
    if (width < 2 || height < 2) return

    sigma.setCustomBBox(null)
    sigma.refresh()

    const camera = sigma.getCamera()
    const state = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
    const ms = options?.animateMs ?? 0
    if (ms > 0) {
      void camera.animate(state, { duration: ms })
    } else {
      camera.setState(state)
    }
  } catch {
    /* sigma torn down */
  }
}
