import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'
import { ALL_NODE_KINDS } from '@/lib/admin/neo-graph/types'
import { toPickerHex } from '@/lib/admin/global-layout-theme'

export const NEO_COLORS_STORAGE_KEY = 'doxa-neo-colors'
export const NEO_COLORS_CHANGED_EVENT = 'doxa-neo-colors-changed'

export type NeoKindColorMap = Record<NeoNodeKind, string>

/** Defaults match the Neo legend (canvas is always dark). */
export const NEO_KIND_COLOR_DEFAULTS: NeoKindColorMap = {
  document: '#2d5a4a',
  publication: '#a68b6d',
  agent: '#3d5a80',
  utterance: '#6b8f71',
  segment: '#8a8580',
  entity: '#7a6b9a',
  proposition: '#c4a35a',
  argument: '#b07d62',
  viewpoint: '#5a8f9a',
  controversy: '#c45c5c',
  dispute: '#9a5a7a',
}

export const NEO_KIND_COLOR_FIELDS: Array<{ kind: NeoNodeKind; label: string }> = [
  { kind: 'document', label: 'Document' },
  { kind: 'publication', label: 'Publication' },
  { kind: 'agent', label: 'Agent' },
  { kind: 'utterance', label: 'Utterance' },
  { kind: 'segment', label: 'Segment' },
  { kind: 'entity', label: 'Entity / Office' },
  { kind: 'proposition', label: 'Proposition' },
  { kind: 'argument', label: 'Argument' },
  { kind: 'viewpoint', label: 'Viewpoint' },
  { kind: 'controversy', label: 'Controversy' },
  { kind: 'dispute', label: 'Dispute' },
]

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

export function normalizeNeoColor(value: string, fallback: string): string {
  return toPickerHex(value, fallback)
}

export function loadNeoKindColors(): NeoKindColorMap {
  const base = { ...NEO_KIND_COLOR_DEFAULTS }
  if (typeof window === 'undefined') return base
  try {
    const raw = localStorage.getItem(NEO_COLORS_STORAGE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Record<string, string>>
    for (const kind of ALL_NODE_KINDS) {
      const next = parsed[kind]
      if (typeof next === 'string' && next.trim()) {
        base[kind] = normalizeNeoColor(next, NEO_KIND_COLOR_DEFAULTS[kind])
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return base
}

export function saveNeoKindColors(colors: NeoKindColorMap): void {
  if (typeof window === 'undefined') return
  const normalized = { ...NEO_KIND_COLOR_DEFAULTS }
  for (const kind of ALL_NODE_KINDS) {
    normalized[kind] = normalizeNeoColor(
      colors[kind] ?? NEO_KIND_COLOR_DEFAULTS[kind],
      NEO_KIND_COLOR_DEFAULTS[kind]
    )
  }
  localStorage.setItem(NEO_COLORS_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(
    new CustomEvent(NEO_COLORS_CHANGED_EVENT, { detail: normalized })
  )
}

export function resetNeoKindColors(): NeoKindColorMap {
  const defaults = { ...NEO_KIND_COLOR_DEFAULTS }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(NEO_COLORS_STORAGE_KEY)
    window.dispatchEvent(
      new CustomEvent(NEO_COLORS_CHANGED_EVENT, { detail: defaults })
    )
  }
  return defaults
}

export function getNeoKindColor(kind: NeoNodeKind): string {
  return loadNeoKindColors()[kind] ?? NEO_KIND_COLOR_DEFAULTS[kind]
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeNeoColor(hex, '#000000')
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  }
}

function toHexChannel(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
}

/** Darken a fill hex for node borders / rim shading. */
export function deriveNeoBorderColor(hex: string, factor = 0.72): string {
  const { r, g, b } = parseHexRgb(hex)
  return `#${toHexChannel(r * factor)}${toHexChannel(g * factor)}${toHexChannel(b * factor)}`
}

/** Lift a fill hex toward white (center highlight / shine). */
export function deriveNeoHighlightColor(hex: string, amount = 0.42): string {
  const { r, g, b } = parseHexRgb(hex)
  const lift = (c: number) => c + (255 - c) * amount
  return `#${toHexChannel(lift(r))}${toHexChannel(lift(g))}${toHexChannel(lift(b))}`
}

/** Linear interpolate two #rrggbb colors. */
export function lerpHex(from: string, to: string, t: number): string {
  const a = parseHexRgb(from)
  const b = parseHexRgb(to)
  const u = Math.max(0, Math.min(1, t))
  return `#${toHexChannel(a.r + (b.r - a.r) * u)}${toHexChannel(a.g + (b.g - a.g) * u)}${toHexChannel(a.b + (b.b - a.b) * u)}`
}

/** Canvas label color with alpha (non-premultiplied; for 2D text fillStyle). */
export function withLabelAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Append 00–ff alpha to a #rrggbb color (Sigma supports 8-digit hex). */
export function withHexAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}${toHexChannel(a * 255)}`
}

/**
 * Premultiplied RGBA for Sigma WebGL (`blendFunc ONE, ONE_MINUS_SRC_ALPHA`).
 * Plain #rrggbbaa looks nearly opaque with that blend mode.
 */
export function withPremultipliedAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHexRgb(hex)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${Math.round(r * a)}, ${Math.round(g * a)}, ${Math.round(b * a)}, ${a})`
}

/** CSS radial matching the WebGL node fill (center lift → base → dark rim). */
export function neoNodeFillGradient(hex: string): string {
  const lift = deriveNeoHighlightColor(hex, 0.42)
  const rim = deriveNeoBorderColor(hex, 0.48)
  const lip = deriveNeoBorderColor(hex, 0.36)
  return `radial-gradient(circle at 32% 28%, ${lift} 0%, ${hex} 46%, ${rim} 82%, ${lip} 100%)`
}

export function isDefaultNeoKindColors(colors: NeoKindColorMap): boolean {
  return ALL_NODE_KINDS.every(
    (kind) =>
      normalizeNeoColor(colors[kind], NEO_KIND_COLOR_DEFAULTS[kind]) ===
      NEO_KIND_COLOR_DEFAULTS[kind]
  )
}

/** Client hook helper: subscribe without React import in this module. */
export function subscribeNeoKindColors(
  listener: (colors: NeoKindColorMap) => void
): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<NeoKindColorMap>).detail
    listener(detail ?? loadNeoKindColors())
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === NEO_COLORS_STORAGE_KEY) listener(loadNeoKindColors())
  }
  window.addEventListener(NEO_COLORS_CHANGED_EVENT, handler)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(NEO_COLORS_CHANGED_EVENT, handler)
    window.removeEventListener('storage', onStorage)
  }
}
