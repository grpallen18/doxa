import type { Sigma } from 'sigma'
import type { NeoSigmaGraph } from '@/lib/admin/neo-graph/graphology-adapter'
import { isIslandCommunityId } from '@/lib/admin/neo-graph/community-ids'

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

/** Frame a node and its ontology island (or the node itself). */
export function frameFocusedCommunity(
  sigma: Sigma,
  nodeId: string,
  options?: { animateMs?: number; padding?: number }
): void {
  try {
    const graph = sigma.getGraph() as NeoSigmaGraph
    if (!graph.hasNode(nodeId)) return
    const communityId = graph.getNodeAttribute(nodeId, 'communityId')
    const ids: string[] = []
    if (typeof communityId === 'string' && isIslandCommunityId(communityId)) {
      graph.forEachNode((id, attrs) => {
        if (attrs.communityId === communityId) ids.push(id)
      })
    }
    if (ids.length < 2) ids.splice(0, ids.length, nodeId)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const id of ids) {
      if (!graph.hasNode(id)) continue
      const attrs = graph.getNodeAttributes(id)
      if (attrs.hidden) continue
      minX = Math.min(minX, attrs.x)
      maxX = Math.max(maxX, attrs.x)
      minY = Math.min(minY, attrs.y)
      maxY = Math.max(maxY, attrs.y)
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return

    const pad = options?.padding ?? 80
    sigma.setCustomBBox({
      x: [minX - pad, maxX + pad],
      y: [minY - pad, maxY + pad],
    })
    sigma.refresh()
    const camera = sigma.getCamera()
    const state = { x: 0.5, y: 0.5, ratio: 1, angle: 0 }
    const ms = options?.animateMs ?? 280
    if (ms > 0) {
      void camera.animate(state, { duration: ms })
    } else {
      camera.setState(state)
    }
  } catch {
    /* sigma torn down */
  }
}
