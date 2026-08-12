import type { NeoEdgeType, NeoNodeKind } from '@/lib/admin/neo-graph/types'
import {
  deriveNeoBorderColor,
  deriveNeoHighlightColor,
  getNeoKindColor,
  loadNeoKindColors,
  NEO_KIND_COLOR_DEFAULTS,
  withPremultipliedAlpha,
} from '@/lib/admin/neo-graph/colors'

export type NodeAppearance = {
  color: string
  size: number
  borderColor: string
  labelColor: string
  priority: number
}

/**
 * Neo explorer canvas is always dark (#121212). Idle labels must stay readable
 * there even when the app shell is in light mode (where --muted is dark brown).
 * These map to dark-theme --muted / a slightly brighter emphasis tone.
 */
export const NEO_LABEL_COLOR_IDLE = '#b4b4b4'
export const NEO_LABEL_COLOR_EMPHASIS = '#e8e4df'
export const NEO_LABEL_COLOR_DIMMED = '#6b6b6b'

const KIND_SIZE: Record<
  NeoNodeKind,
  { baseSize: number; priority: number }
> = {
  document: { baseSize: 4, priority: 90 },
  controversy: { baseSize: 9, priority: 110 },
  viewpoint: { baseSize: 7, priority: 95 },
  proposition: { baseSize: 6, priority: 88 },
  dispute: { baseSize: 6, priority: 86 },
  assessment: { baseSize: 5, priority: 82 },
  evidence_check: { baseSize: 4, priority: 78 },
  citation: { baseSize: 3, priority: 55 },
  method_run: { baseSize: 4, priority: 60 },
  argument: { baseSize: 5, priority: 75 },
  publication: { baseSize: 14, priority: 100 },
  agent: { baseSize: 5, priority: 70 },
  entity: { baseSize: 4, priority: 65 },
  utterance: { baseSize: 3, priority: 50 },
  segment: { baseSize: 2, priority: 20 },
  cluster: { baseSize: 14, priority: 120 },
}

/** Union 2.0 nebula — dust with a few hotter neurons. */
const KIND_SIZE_COMPACT: Record<
  NeoNodeKind,
  { baseSize: number; priority: number }
> = {
  document: { baseSize: 1.05, priority: 90 },
  controversy: { baseSize: 1.55, priority: 110 },
  viewpoint: { baseSize: 1.2, priority: 95 },
  proposition: { baseSize: 1.1, priority: 88 },
  dispute: { baseSize: 1.1, priority: 86 },
  assessment: { baseSize: 0.95, priority: 82 },
  evidence_check: { baseSize: 0.9, priority: 78 },
  citation: { baseSize: 0.75, priority: 55 },
  method_run: { baseSize: 0.85, priority: 60 },
  argument: { baseSize: 1.0, priority: 75 },
  publication: { baseSize: 1.45, priority: 100 },
  agent: { baseSize: 0.95, priority: 70 },
  entity: { baseSize: 0.9, priority: 65 },
  utterance: { baseSize: 0.7, priority: 50 },
  segment: { baseSize: 0.6, priority: 20 },
  cluster: { baseSize: 5, priority: 120 },
}

export type NeoSizeMode = 'default' | 'compact'

const EDGE_COLOR: Record<NeoEdgeType, string> = {
  PUBLISHED_BY: '#a68b6d',
  CONTAINS: '#8a8580',
  GROUNDED_IN: '#6b8f71',
  ASSERTED_BY: '#3d5a80',
  REFERRED_AS: '#7a6b9a',
  MENTIONS: '#9a8bb0',
  EXPRESSES: '#c4a35a',
  HAS_ROLE: '#b07d62',
  ADVANCES: '#5a8f9a',
  INCLUDES: '#c45c5c',
  RELATES_TO: '#d4a017',
  CONCERNS: '#9a5a7a',
  VARIANT_OF: '#8a8580',
  ABOUT: '#8a8580',
  CHECKS: '#5a9a7a',
  CITES: '#8a9a6a',
  HELD_BY: '#3d5a80',
  DERIVED_FROM: '#8a8580',
  PRODUCED_BY: '#6a6a7a',
}

/** 0..1 heat from degree — high-degree nodes read as hotter neurons. */
export function nebulaHeat(degree: number): number {
  return Math.min(1, Math.log2(1 + Math.max(0, degree)) / 5.5)
}

export const NEBULA_HOT_HEAT = 0.5

export function applyNebulaHeat(hex: string, degree: number): string {
  const h = nebulaHeat(degree)
  if (h < 0.12) return hex
  return deriveNeoHighlightColor(hex, 0.12 + h * 0.72)
}

export function resolveNodeAppearance(input: {
  kind: NeoNodeKind
  degreeHint?: number
  sizeMode?: NeoSizeMode
}): NodeAppearance {
  const compact = input.sizeMode === 'compact'
  const sizeBase = compact ? KIND_SIZE_COMPACT[input.kind] : KIND_SIZE[input.kind]
  const color = getNeoKindColor(input.kind)
  const degree = Math.max(0, input.degreeHint ?? 0)
  const degreeBoost = compact
    ? Math.min(2.4, Math.log2(1 + degree) * 0.45)
    : Math.min(12, degree * 0.7)
  return {
    color,
    borderColor: deriveNeoBorderColor(color),
    size: sizeBase.baseSize + degreeBoost,
    labelColor: NEO_LABEL_COLOR_IDLE,
    priority: sizeBase.priority,
  }
}

export const NEO_EDGE_SIZE_IDLE = 0.7
export const NEO_EDGE_SIZE_ACTIVE = 2.2
export const NEO_EDGE_IDLE_ALPHA = 0.5
export const NEO_EDGE_INTERSTITIAL_IDLE_ALPHA = 0.1
export const NEO_EDGE_INTERSTITIAL_IDLE_SIZE = 0.7

export const NEBULA_HEAT_DEFAULT = 10
export const NEBULA_HEAT_MIN = 1
export const NEBULA_HEAT_MAX = 100

/** Idle tissue alpha: heat / √edges so 20-story silk and 60-story chalk share one knob. */
export function nebulaIdleAlpha(heat: number, edgeCount: number): number {
  const k = Math.max(NEBULA_HEAT_MIN, Math.min(NEBULA_HEAT_MAX, heat))
  const n = Math.max(1, edgeCount)
  return Math.min(0.35, Math.max(0.02, k / Math.sqrt(n)))
}

export function resolveEdgeColor(type: NeoEdgeType): string {
  return EDGE_COLOR[type] ?? '#6b6560'
}

export function resolveIdleEdgeColor(type: NeoEdgeType): string {
  return withPremultipliedAlpha(resolveEdgeColor(type), NEO_EDGE_IDLE_ALPHA)
}

/** Source→target node-colored edge chrome at fade progress `t` (0..1). */
export function resolveEdgeGradientAt(
  sourceHex: string,
  targetHex: string,
  t: number
): { color: string; targetColor: string; size: number } {
  const u = Math.max(0, Math.min(1, t))
  const alpha = NEO_EDGE_IDLE_ALPHA + (1 - NEO_EDGE_IDLE_ALPHA) * u
  const size = NEO_EDGE_SIZE_IDLE + (NEO_EDGE_SIZE_ACTIVE - NEO_EDGE_SIZE_IDLE) * u
  return {
    color: withPremultipliedAlpha(sourceHex, alpha),
    targetColor: withPremultipliedAlpha(targetHex, alpha),
    size,
  }
}

/** @deprecated Prefer resolveEdgeGradientAt for node-colored edges. */
export function resolveEdgeAppearanceAt(type: NeoEdgeType, t: number): {
  color: string
  size: number
} {
  const u = Math.max(0, Math.min(1, t))
  const solid = resolveEdgeColor(type)
  const alpha = NEO_EDGE_IDLE_ALPHA + (1 - NEO_EDGE_IDLE_ALPHA) * u
  const size = NEO_EDGE_SIZE_IDLE + (NEO_EDGE_SIZE_ACTIVE - NEO_EDGE_SIZE_IDLE) * u
  return {
    color: withPremultipliedAlpha(solid, alpha),
    size,
  }
}

export function getNeoKindLegend(): Array<{
  kind: NeoNodeKind
  label: string
  color: string
}> {
  const colors = loadNeoKindColors()
  return (
    Object.keys(NEO_KIND_COLOR_DEFAULTS) as NeoNodeKind[]
  ).map((kind) => ({
    kind,
    label: kind.charAt(0).toUpperCase() + kind.slice(1),
    color: colors[kind] ?? NEO_KIND_COLOR_DEFAULTS[kind],
  }))
}

/** @deprecated Prefer getNeoKindLegend() for live admin colors. */
export const NEO_KIND_LEGEND = (
  Object.keys(NEO_KIND_COLOR_DEFAULTS) as NeoNodeKind[]
).map((kind) => ({
  kind,
  label: kind.charAt(0).toUpperCase() + kind.slice(1),
  color: NEO_KIND_COLOR_DEFAULTS[kind],
}))
