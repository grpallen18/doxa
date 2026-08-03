import type { NeoEdgeType, NeoNodeKind } from '@/lib/admin/neo-graph/types'
import {
  deriveNeoBorderColor,
  getNeoKindColor,
  loadNeoKindColors,
  NEO_KIND_COLOR_DEFAULTS,
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
  document: { baseSize: 16, priority: 100 },
  controversy: { baseSize: 18, priority: 110 },
  viewpoint: { baseSize: 14, priority: 95 },
  proposition: { baseSize: 12, priority: 90 },
  dispute: { baseSize: 12, priority: 88 },
  argument: { baseSize: 11, priority: 75 },
  publication: { baseSize: 12, priority: 80 },
  agent: { baseSize: 11, priority: 70 },
  entity: { baseSize: 10, priority: 65 },
  utterance: { baseSize: 7, priority: 50 },
  segment: { baseSize: 5, priority: 20 },
}

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
}

export function resolveNodeAppearance(input: {
  kind: NeoNodeKind
  degreeHint?: number
}): NodeAppearance {
  const sizeBase = KIND_SIZE[input.kind]
  const color = getNeoKindColor(input.kind)
  const degreeBoost = Math.min(6, Math.max(0, (input.degreeHint ?? 0) * 0.35))
  return {
    color,
    borderColor: deriveNeoBorderColor(color),
    size: sizeBase.baseSize + degreeBoost,
    labelColor: NEO_LABEL_COLOR_IDLE,
    priority: sizeBase.priority,
  }
}

export function resolveEdgeColor(type: NeoEdgeType): string {
  return EDGE_COLOR[type] ?? '#6b6560'
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
