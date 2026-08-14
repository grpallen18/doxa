import * as THREE from 'three'
import type { Union3DLink, Union3DNode } from '@/lib/admin/neo-graph/union-3d'

export const NEO_DPR_CAP = 1.75

const MAX_NODES = 25000
const MAX_EDGES = 50000

function starWorldSize(node: Union3DNode): number {
  const heat = Math.max(0, Math.min(1, node.heat ?? 0))
  const degree = Math.max(0, node.degree ?? 0)
  return (
    2.1 +
    (node.val || 1) * 0.8 +
    Math.pow(heat, 1.45) * 20 +
    Math.sqrt(degree) * 1.05
  )
}

function parseHex(color: string): THREE.Color {
  try {
    return new THREE.Color(color || '#a8a29e')
  } catch {
    return new THREE.Color('#a8a29e')
  }
}

type LinkEnd = string | { id?: string; x?: number; y?: number; z?: number } | null

function endpointId(end: LinkEnd): string | null {
  if (typeof end === 'string' && end) return end
  if (end && typeof end === 'object' && typeof end.id === 'string') return end.id
  return null
}

export type BatchedNebulaScene = {
  attach: (scene: THREE.Scene) => void
  setGraph: (nodes: Union3DNode[], links: Union3DLink[]) => void
  syncPositions: (
    nodes: Array<{ id?: string; x?: number; y?: number; z?: number }>
  ) => void
  setIdleOpacity: (opacity: number) => void
  setSelection: (nodeId: string | null) => void
  setPixelRatio: (dpr: number) => void
  setViewportHeight: (height: number) => void
  tickPulse: (nowMs: number) => void
  pick: (
    camera: THREE.Camera,
    canvas: HTMLElement,
    clientX: number,
    clientY: number
  ) => Union3DNode | null
  dispose: () => void
}

/** Shared glow texture — one canvas, used by the point-cloud stars. */
let glowTexture: THREE.CanvasTexture | null = null

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    glowTexture = new THREE.CanvasTexture(canvas)
    return glowTexture
  }
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  )
  g.addColorStop(0, 'rgba(255,255,255,0.88)')
  g.addColorStop(0.15, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.38, 'rgba(255,255,255,0.24)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.07)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(canvas)
  glowTexture.needsUpdate = true
  return glowTexture
}

export function createBatchedNebulaScene(): BatchedNebulaScene {
  const nodes: Union3DNode[] = []
  const nodeIndex = new Map<string, number>()
  const incident = new Map<string, number[]>()
  const edgeEnds: Array<{ s: string; t: string }> = []

  const starGeo = new THREE.BufferGeometry()
  const starPos = new Float32Array(MAX_NODES * 3)
  const starColor = new Float32Array(MAX_NODES * 3)
  const starSize = new Float32Array(MAX_NODES)
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColor, 3))
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1))
  starGeo.setDrawRange(0, 0)

  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: getGlowTexture() },
      uPixelRatio: { value: 1 },
      uHeight: { value: 600 },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      uniform float uPixelRatio;
      uniform float uHeight;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float att = uHeight / max(1.0, -mv.z);
        gl_PointSize = clamp(aSize * uPixelRatio * att * 0.55, 2.0, 112.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        vec4 texel = texture2D(uMap, gl_PointCoord);
        if (texel.a < 0.02) discard;
        gl_FragColor = vec4(vColor * texel.rgb, texel.a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false

  const lineGeo = new THREE.BufferGeometry()
  const linePos = new Float32Array(MAX_EDGES * 2 * 3)
  const lineColor = new Float32Array(MAX_EDGES * 2 * 3)
  const lineHighlight = new Float32Array(MAX_EDGES * 2)
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
  lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColor, 3))
  lineGeo.setAttribute('aHighlight', new THREE.BufferAttribute(lineHighlight, 1))
  lineGeo.setDrawRange(0, 0)

  const lineMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 0.2 },
      uTime: { value: 0 },
      uHasSelection: { value: 0 },
    },
    vertexShader: `
      attribute vec3 color;
      attribute float aHighlight;
      varying vec3 vColor;
      varying float vHighlight;
      void main() {
        vColor = color;
        vHighlight = aHighlight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform float uTime;
      uniform float uHasSelection;
      varying vec3 vColor;
      varying float vHighlight;
      void main() {
        float op = uOpacity;
        if (uHasSelection > 0.5 && vHighlight > 0.5) {
          float pulse = 0.5 + 0.5 * sin(uTime * 4.71238898);
          float bright = min(0.95, uOpacity * 2.6 + 0.28);
          op = mix(uOpacity, bright, pulse);
        }
        gl_FragColor = vec4(vColor * op, op);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const lines = new THREE.LineSegments(lineGeo, lineMat)
  lines.frustumCulled = false

  let edgeCount = 0
  let selectedId: string | null = null

  const applyHighlights = () => {
    lineHighlight.fill(0)
    if (selectedId) {
      const edges = incident.get(selectedId)
      if (edges) {
        for (const e of edges) {
          lineHighlight[e * 2] = 1
          lineHighlight[e * 2 + 1] = 1
        }
      }
    }
    const attr = lineGeo.getAttribute('aHighlight') as THREE.BufferAttribute
    attr.needsUpdate = true
    lineMat.uniforms.uHasSelection.value = selectedId ? 1 : 0
  }

  return {
    attach(scene) {
      scene.add(stars)
      scene.add(lines)
    },
    setGraph(nextNodes, nextLinks) {
      nodes.length = 0
      nodeIndex.clear()
      incident.clear()
      const n = Math.min(nextNodes.length, MAX_NODES)
      for (let i = 0; i < n; i++) {
        const node = nextNodes[i]!
        nodes.push(node)
        nodeIndex.set(node.id, i)
        const c = parseHex(node.color)
        starPos[i * 3] = node.x
        starPos[i * 3 + 1] = node.y
        starPos[i * 3 + 2] = node.z
        starColor[i * 3] = c.r
        starColor[i * 3 + 1] = c.g
        starColor[i * 3 + 2] = c.b
        starSize[i] = starWorldSize(node)
      }
      starGeo.setDrawRange(0, n)
      ;(starGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
        true
      ;(starGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate =
        true
      ;(starGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate =
        true
      starGeo.computeBoundingSphere()

      const eMax = Math.min(nextLinks.length, MAX_EDGES)
      edgeCount = 0
      edgeEnds.length = 0
      for (let e = 0; e < eMax; e++) {
        const link = nextLinks[e]!
        const sId = endpointId(link.source as LinkEnd)
        const tId = endpointId(link.target as LinkEnd)
        if (!sId || !tId) continue
        const si = nodeIndex.get(sId)
        const ti = nodeIndex.get(tId)
        if (si == null || ti == null) continue
        const idx = edgeCount
        const s = nodes[si]!
        const t = nodes[ti]!
        linePos[idx * 6] = s.x
        linePos[idx * 6 + 1] = s.y
        linePos[idx * 6 + 2] = s.z
        linePos[idx * 6 + 3] = t.x
        linePos[idx * 6 + 4] = t.y
        linePos[idx * 6 + 5] = t.z
        const c0 = parseHex(link.sourceColor)
        const c1 = parseHex(link.targetColor)
        lineColor[idx * 6] = c0.r
        lineColor[idx * 6 + 1] = c0.g
        lineColor[idx * 6 + 2] = c0.b
        lineColor[idx * 6 + 3] = c1.r
        lineColor[idx * 6 + 4] = c1.g
        lineColor[idx * 6 + 5] = c1.b
        edgeEnds.push({ s: sId, t: tId })
        const listS = incident.get(sId)
        if (listS) listS.push(idx)
        else incident.set(sId, [idx])
        const listT = incident.get(tId)
        if (listT) listT.push(idx)
        else incident.set(tId, [idx])
        edgeCount += 1
      }
      lineGeo.setDrawRange(0, edgeCount * 2)
      ;(lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
        true
      ;(lineGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate =
        true
      applyHighlights()
    },
    syncPositions(liveNodes) {
      const byId = new Map<string, { x: number; y: number; z: number }>()
      for (const node of liveNodes) {
        if (!node.id) continue
        const i = nodeIndex.get(node.id)
        if (i == null) continue
        const x = node.x ?? 0
        const y = node.y ?? 0
        const z = node.z ?? 0
        byId.set(node.id, { x, y, z })
        const stored = nodes[i]
        if (stored) {
          stored.x = x
          stored.y = y
          stored.z = z
        }
        starPos[i * 3] = x
        starPos[i * 3 + 1] = y
        starPos[i * 3 + 2] = z
      }
      ;(starGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
        true

      for (let e = 0; e < edgeEnds.length; e++) {
        const ends = edgeEnds[e]!
        const s = byId.get(ends.s)
        const t = byId.get(ends.t)
        if (!s || !t) continue
        linePos[e * 6] = s.x
        linePos[e * 6 + 1] = s.y
        linePos[e * 6 + 2] = s.z
        linePos[e * 6 + 3] = t.x
        linePos[e * 6 + 4] = t.y
        linePos[e * 6 + 5] = t.z
      }
      ;(lineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate =
        true
    },
    setIdleOpacity(opacity) {
      lineMat.uniforms.uOpacity.value = opacity
    },
    setSelection(nodeId) {
      selectedId = nodeId
      applyHighlights()
    },
    setPixelRatio(dpr) {
      starMat.uniforms.uPixelRatio.value = dpr
    },
    setViewportHeight(height) {
      starMat.uniforms.uHeight.value = Math.max(1, height)
    },
    tickPulse(nowMs) {
      lineMat.uniforms.uTime.value = nowMs / 1000
    },
    pick(camera, canvas, clientX, clientY) {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return null
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const tmp = new THREE.Vector3()
      let best: Union3DNode | null = null
      let bestDist = 22
      for (const node of nodes) {
        tmp.set(node.x, node.y, node.z).project(camera)
        if (tmp.z < -1 || tmp.z > 1) continue
        const sx = (tmp.x * 0.5 + 0.5) * rect.width
        const sy = (-tmp.y * 0.5 + 0.5) * rect.height
        const d = Math.hypot(sx - mx, sy - my)
        const threshold = Math.max(10, Math.min(28, starWorldSize(node) * 0.45))
        if (d < threshold && d < bestDist) {
          best = node
          bestDist = d
        }
      }
      return best
    },
    dispose() {
      stars.removeFromParent()
      lines.removeFromParent()
      starGeo.dispose()
      starMat.dispose()
      lineGeo.dispose()
      lineMat.dispose()
    },
  }
}

export function capDevicePixelRatio(raw?: number): number {
  return Math.min(raw ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1), NEO_DPR_CAP)
}
