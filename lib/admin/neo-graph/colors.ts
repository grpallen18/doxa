import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'
import { ALL_NODE_KINDS } from '@/lib/admin/neo-graph/types'
import { toPickerHex } from '@/lib/admin/global-layout-theme'

export const NEO_COLORS_STORAGE_KEY = 'doxa-neo-colors'
export const NEO_COLORS_CHANGED_EVENT = 'doxa-neo-colors-changed'

export type NeoKindColorMap = Record<NeoNodeKind, string>

/** Defaults match the Phase 0 legend (canvas is always dark). */
export const NEO_KIND_COLOR_DEFAULTS: NeoKindColorMap = {
  document: '#2d5a4a',
  publication: '#a68b6d',
  agent: '#3d5a80',
  utterance: '#6b8f71',
  segment: '#8a8580',
  entity: '#7a6b9a',
}

export const NEO_KIND_COLOR_FIELDS: Array<{ kind: NeoNodeKind; label: string }> = [
  { kind: 'document', label: 'Document' },
  { kind: 'publication', label: 'Publication' },
  { kind: 'agent', label: 'Agent' },
  { kind: 'utterance', label: 'Utterance' },
  { kind: 'segment', label: 'Segment' },
  { kind: 'entity', label: 'Entity / Office' },
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

/** Darken a fill hex for node borders. */
export function deriveNeoBorderColor(hex: string): string {
  const normalized = normalizeNeoColor(hex, '#000000')
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  const factor = 0.72
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * factor)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
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
