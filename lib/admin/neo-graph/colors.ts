import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'
import { ALL_NODE_KINDS } from '@/lib/admin/neo-graph/types'
import { toPickerHex } from '@/lib/admin/global-layout-theme'

/** @deprecated Kept for one-time migration from browser-local themes. */
export const NEO_COLORS_STORAGE_KEY = 'doxa-neo-colors'
export const NEO_COLORS_CHANGED_EVENT = 'doxa-neo-colors-changed'
const NEO_COLORS_MIGRATED_KEY = 'doxa-neo-colors-migrated-v1'

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
  question: '#4a7a9a',
  dispute: '#9a5a7a',
  assessment: '#6a7a9a',
  evidence_check: '#5a9a7a',
  citation: '#8a9a6a',
  method_run: '#6a6a7a',
  cluster: '#4a7c6f',
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
  { kind: 'question', label: 'Question' },
  { kind: 'dispute', label: 'Dispute' },
  { kind: 'assessment', label: 'Assessment (analyzed)' },
  { kind: 'evidence_check', label: 'Evidence check (analyzed)' },
  { kind: 'citation', label: 'Citation' },
  { kind: 'method_run', label: 'Method run' },
  { kind: 'cluster', label: 'Cluster' },
]

/** In-memory cache — hydrated from the server; sync reads stay fast. */
let cachedColors: NeoKindColorMap = { ...NEO_KIND_COLOR_DEFAULTS }
let hydratedFromServer = false

export function normalizeNeoColor(value: string, fallback: string): string {
  return toPickerHex(value, fallback)
}

export function mergeNeoKindColors(
  partial: Partial<Record<string, unknown>> | null | undefined
): NeoKindColorMap {
  const base = { ...NEO_KIND_COLOR_DEFAULTS }
  if (!partial || typeof partial !== 'object') return base
  for (const kind of ALL_NODE_KINDS) {
    const next = partial[kind]
    if (typeof next === 'string' && next.trim()) {
      base[kind] = normalizeNeoColor(next, NEO_KIND_COLOR_DEFAULTS[kind])
    }
  }
  return base
}

export function normalizeNeoKindColorMap(raw: unknown): NeoKindColorMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...NEO_KIND_COLOR_DEFAULTS }
  }
  return mergeNeoKindColors(raw as Partial<Record<string, unknown>>)
}

function publishColors(colors: NeoKindColorMap): void {
  cachedColors = colors
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(NEO_COLORS_STORAGE_KEY, JSON.stringify(colors))
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent(NEO_COLORS_CHANGED_EVENT, { detail: colors })
  )
}

function readLegacyLocalColors(): NeoKindColorMap | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(NEO_COLORS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Record<string, string>>
    const merged = mergeNeoKindColors(parsed)
    if (isDefaultNeoKindColors(merged)) return null
    return merged
  } catch {
    return null
  }
}

/** Sync read of the current (cached / last-known) Neo colors. */
export function loadNeoKindColors(): NeoKindColorMap {
  return { ...cachedColors }
}

export function getNeoKindColor(kind: NeoNodeKind): string {
  return cachedColors[kind] ?? NEO_KIND_COLOR_DEFAULTS[kind]
}

/**
 * Apply colors locally (optimistic UI). Prefer saveNeoKindColors / reset for
 * durable writes.
 */
export function applyNeoKindColorsLocally(colors: NeoKindColorMap): void {
  publishColors(normalizeNeoKindColorMap(colors))
}

/** Fetch global Neo colors from the server and hydrate the cache. */
export async function fetchNeoKindColors(): Promise<NeoKindColorMap> {
  const res = await fetch('/api/admin/neo/kind-colors', { cache: 'no-store' })
  const json = (await res.json()) as {
    data?: { colors?: NeoKindColorMap; isDefault?: boolean }
    error?: { message?: string }
  }
  if (!res.ok || json.error || !json.data?.colors) {
    throw new Error(json.error?.message ?? 'Failed to load Neo colors')
  }

  let colors = mergeNeoKindColors(json.data.colors)

  // One-time: if the server still has defaults but this browser has a custom
  // local palette, promote it so existing admin themes are not lost.
  if (
    typeof window !== 'undefined' &&
    json.data.isDefault &&
    !localStorage.getItem(NEO_COLORS_MIGRATED_KEY)
  ) {
    const legacy = readLegacyLocalColors()
    if (legacy && !isDefaultNeoKindColors(legacy)) {
      try {
        colors = await persistNeoKindColors(legacy)
      } catch {
        /* keep server defaults */
      }
    }
    try {
      localStorage.setItem(NEO_COLORS_MIGRATED_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  hydratedFromServer = true
  publishColors(colors)
  return colors
}

async function persistNeoKindColors(
  colors: NeoKindColorMap,
  reset = false
): Promise<NeoKindColorMap> {
  const res = await fetch('/api/admin/neo/kind-colors', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reset ? { reset: true } : { colors }),
    cache: 'no-store',
  })
  const json = (await res.json()) as {
    data?: { colors?: NeoKindColorMap }
    error?: { message?: string }
  }
  if (!res.ok || json.error || !json.data?.colors) {
    throw new Error(json.error?.message ?? 'Failed to save Neo colors')
  }
  const merged = mergeNeoKindColors(json.data.colors)
  hydratedFromServer = true
  publishColors(merged)
  return merged
}

/** Save global Neo colors (all admins / browsers). */
export async function saveNeoKindColors(
  colors: NeoKindColorMap
): Promise<NeoKindColorMap> {
  const normalized = normalizeNeoKindColorMap(colors)
  publishColors(normalized)
  return persistNeoKindColors(normalized)
}

/** Reset global Neo colors to defaults. */
export async function resetNeoKindColors(): Promise<NeoKindColorMap> {
  publishColors({ ...NEO_KIND_COLOR_DEFAULTS })
  return persistNeoKindColors(NEO_KIND_COLOR_DEFAULTS, true)
}

export function hasHydratedNeoKindColors(): boolean {
  return hydratedFromServer
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
  window.addEventListener(NEO_COLORS_CHANGED_EVENT, handler)
  return () => {
    window.removeEventListener(NEO_COLORS_CHANGED_EVENT, handler)
  }
}

// Seed cache from localStorage mirror on module load (client only) for less flash.
if (typeof window !== 'undefined') {
  const legacy = readLegacyLocalColors()
  if (legacy) cachedColors = legacy
}
