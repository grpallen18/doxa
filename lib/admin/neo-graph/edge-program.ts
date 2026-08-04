import {
  createEdgeCurveProgram,
  EdgeCurvedArrowProgram,
} from '@sigma/edge-curve'
import { createEdgeCompoundProgram } from 'sigma/rendering'
import type { EdgeProgramType } from 'sigma/rendering'
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types'
import { parseColor } from 'sigma/utils'

// Factory return type hides processVisibleItem; runtime class still has it.
const GlowCurveProgram = createEdgeCurveProgram() as unknown as {
  new (...args: ConstructorParameters<EdgeProgramType>): {
    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      sourceData: NodeDisplayData,
      targetData: NodeDisplayData,
      data: EdgeDisplayData
    ): void
  }
}

type GlowLayer = {
  /** Width relative to the core edge size. */
  sizeMult: number
  /** Opacity relative to the core edge's alpha (after a small lift). */
  alphaRatio: number
}

/**
 * Concentric glow ribbons: brighter near the core, fading outward.
 * Drawn back-to-front (outer first) under the real arrow.
 */
const GLOW_LAYERS: GlowLayer[] = [
  { sizeMult: 5.0, alphaRatio: 0.12 },
  { sizeMult: 3.4, alphaRatio: 0.22 },
  { sizeMult: 2.2, alphaRatio: 0.38 },
]

/** Mild lift — enough to bloom without washing out. */
const GLOW_LIFT = 0.18

function edgeGlowColor(color: string, alphaRatio: number): string {
  const parsed = parseColor(color)
  const srcAlpha = Math.max(parsed.a, 0.001)
  const r = Math.min(255, parsed.r / srcAlpha)
  const g = Math.min(255, parsed.g / srcAlpha)
  const b = Math.min(255, parsed.b / srcAlpha)
  const lr = r + (255 - r) * GLOW_LIFT
  const lg = g + (255 - g) * GLOW_LIFT
  const lb = b + (255 - b) * GLOW_LIFT
  const glow = Math.min(0.55, srcAlpha * alphaRatio)
  return `rgba(${Math.round(lr * glow)}, ${Math.round(lg * glow)}, ${Math.round(lb * glow)}, ${glow})`
}

function createGlowLayerProgram(layer: GlowLayer): EdgeProgramType {
  class NeoEdgeGlowLayerProgram extends GlowCurveProgram {
    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      sourceData: NodeDisplayData,
      targetData: NodeDisplayData,
      data: EdgeDisplayData
    ) {
      super.processVisibleItem(edgeIndex, startIndex, sourceData, targetData, {
        ...data,
        size: (data.size || 1) * layer.sizeMult,
        color: edgeGlowColor(
          typeof data.color === 'string' ? data.color : '#888888',
          layer.alphaRatio
        ),
      })
    }
  }
  return NeoEdgeGlowLayerProgram as unknown as EdgeProgramType
}

/** Curved arrow with a soft falloff glow (bright near core → fade outward). */
export const NeoCurvedArrowProgram = createEdgeCompoundProgram([
  ...GLOW_LAYERS.map(createGlowLayerProgram),
  EdgeCurvedArrowProgram,
])
