import { LANDING_PATH } from '@/lib/constants'

export type ThemeMode = 'light' | 'dark'
export type ThemePreferenceMode = ThemeMode | 'system'
export type ThemeColorsByMode = Record<ThemeMode, Record<string, string>>

export const THEME_STYLE_ELEMENT_IDS: Record<ThemeMode, string> = {
  light: 'doxa-theme-vars-light',
  dark: 'doxa-theme-vars-dark',
}
export type GlobalLayoutColorVar = {
  key: string
  label: string
  group: string
  defaults: Record<ThemeMode, string>
}

/**
 * Editable brand / semantic tokens. shadcn duplicates (primary, card, ring, …)
 * alias these in globals.css — do not edit them separately.
 */
export const GLOBAL_LAYOUT_COLOR_VARS: GlobalLayoutColorVar[] = [
  {
    key: '--background',
    label: 'Background',
    group: 'Surfaces',
    defaults: { light: '#f7f0e4', dark: '#141414' },
  },
  {
    key: '--surface',
    label: 'Surface',
    group: 'Surfaces',
    defaults: { light: '#fefbf1', dark: '#1f1f1f' },
  },
  {
    key: '--surface-soft',
    label: 'Surface soft',
    group: 'Surfaces',
    defaults: { light: '#fffdfa', dark: '#292929' },
  },
  {
    key: '--surface-section',
    label: 'Surface section',
    group: 'Surfaces',
    defaults: { light: '#fffdfa', dark: '#141414' },
  },
  {
    key: '--border',
    label: 'Border',
    group: 'Borders',
    defaults: { light: '#dbdbdb', dark: '#333333' },
  },
  {
    key: '--foreground',
    label: 'Foreground',
    group: 'Text',
    defaults: { light: '#1a1712', dark: '#ffffff' },
  },
  {
    key: '--muted',
    label: 'Muted text',
    group: 'Text',
    defaults: { light: '#5c5957', dark: '#dedede' },
  },
  {
    key: '--inverted',
    label: 'Inverse text',
    group: 'Text',
    defaults: { light: '#ffffff', dark: '#000000' },
  },
  {
    key: '--accent-primary',
    label: 'Accent primary',
    group: 'Accents',
    defaults: { light: '#775909', dark: '#e1c993' },
  },
  {
    key: '--accent-primary-foreground',
    label: 'Accent primary foreground',
    group: 'Accents',
    defaults: { light: '#faf9f7', dark: '#1a1712' },
  },
  {
    key: '--accent-secondary',
    label: 'Accent secondary',
    group: 'Accents',
    defaults: { light: '#a68b6d', dark: '#1f1f1f' },
  },
  {
    key: '--accent-secondary-foreground',
    label: 'Accent secondary foreground',
    group: 'Accents',
    defaults: { light: '#1a1712', dark: '#1a1712' },
  },
  {
    key: '--accent-tertiary',
    label: 'Accent tertiary',
    group: 'Accents',
    defaults: { light: '#3d5a80', dark: '#ededed' },
  },
  {
    key: '--accent-tertiary-foreground',
    label: 'Accent tertiary foreground',
    group: 'Accents',
    defaults: { light: '#faf9f7', dark: '#1b1409' },
  },
  {
    key: '--destructive',
    label: 'Destructive',
    group: 'Status',
    defaults: { light: '#dc2626', dark: '#ff0000' },
  },
  {
    key: '--destructive-foreground',
    label: 'Destructive foreground',
    group: 'Status',
    defaults: { light: '#fafafa', dark: '#fafafa' },
  },
  {
    key: '--success',
    label: 'Success',
    group: 'Status',
    defaults: { light: '#16a34a', dark: '#00ff62' },
  },
  {
    key: '--success-foreground',
    label: 'Success foreground',
    group: 'Status',
    defaults: { light: '#052e16', dark: '#dcfce7' },
  },
  {
    key: '--link-accent',
    label: 'Link',
    group: 'Links',
    defaults: { light: '#0000ee', dark: '#febe34' },
  },
  {
    key: '--link-accent-hover',
    label: 'Link hover',
    group: 'Links',
    defaults: { light: '#3358f5', dark: '#ffc766' },
  },
]

/** Former picker keys that now alias brand tokens — clear inline overrides on apply. */
const RETIRED_INLINE_COLOR_KEYS = [
  '--chrome-warm',
  '--separator',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--ring',
  '--input',
  '--border-subtle',
  '--border-muted',
  '--border-heading',
  '--muted-bg',
  '--muted-soft',
  '--surface-accordion',
  '--link-default-blue',
  '--link-default-blue-hover',
  '--link-default-green',
  '--link-default-green-hover',
] as const

/** Map legacy preset / localStorage keys onto the slim catalog. */
const LEGACY_COLOR_KEY_MAP: Record<string, string> = {
  '--card': '--surface',
  '--card-foreground': '--foreground',
  '--popover': '--background',
  '--popover-foreground': '--foreground',
  '--primary': '--accent-primary',
  '--primary-foreground': '--accent-primary-foreground',
  '--ring': '--accent-primary',
  '--secondary': '--surface-section',
  '--secondary-foreground': '--foreground',
  '--border-subtle': '--border',
  '--input': '--border',
  '--muted-bg': '--surface',
  '--surface-accordion': '--surface-section',
}

function allowedColorKeys(): Set<string> {
  return new Set(GLOBAL_LAYOUT_COLOR_VARS.map((entry) => entry.key))
}

/**
 * Prefer current catalog keys; fill gaps from legacy aliases without overwriting
 * an explicit new-key value. Link constants map by mode (blue in light, green in dark).
 */
export function migrateLegacyThemeColors(
  colors: Record<string, unknown>,
  mode: ThemeMode = 'light'
): Record<string, string> {
  const allowed = allowedColorKeys()
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(colors)) {
    if (!allowed.has(key)) continue
    if (typeof value === 'string' && isHexColor(value)) out[key] = value.toLowerCase()
  }

  for (const [legacyKey, targetKey] of Object.entries(LEGACY_COLOR_KEY_MAP)) {
    if (out[targetKey]) continue
    const value = colors[legacyKey]
    if (typeof value === 'string' && isHexColor(value)) out[targetKey] = value.toLowerCase()
  }

  const linkLegacy =
    mode === 'dark'
      ? {
          accent: '--link-default-green',
          hover: '--link-default-green-hover',
        }
      : {
          accent: '--link-default-blue',
          hover: '--link-default-blue-hover',
        }
  if (!out['--link-accent']) {
    const value = colors[linkLegacy.accent]
    if (typeof value === 'string' && isHexColor(value)) {
      out['--link-accent'] = value.toLowerCase()
    }
  }
  if (!out['--link-accent-hover']) {
    const value = colors[linkLegacy.hover]
    if (typeof value === 'string' && isHexColor(value)) {
      out['--link-accent-hover'] = value.toLowerCase()
    }
  }

  return out
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim())
}

export function toPickerHex(value: string, fallback: string): string {
  const trimmed = value.trim()
  if (isHexColor(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const r = trimmed[1]
    const g = trimmed[2]
    const b = trimmed[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const toHex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`.toLowerCase()
  }
  return isHexColor(fallback) ? fallback.toLowerCase() : '#000000'
}

export function buildThemeCssRule(
  mode: ThemeMode,
  colors: Record<string, unknown>
): string {
  const normalized = normalizeThemeColors(colors, mode)
  const selector = mode === 'dark' ? '.dark' : ':root'
  const declarations = GLOBAL_LAYOUT_COLOR_VARS.map(
    ({ key }) => `${key}:${normalized[key]};`
  ).join('')
  return `${selector}{${declarations}}`
}

export function updateThemeStyleElement(
  mode: ThemeMode,
  colors: Record<string, unknown>
): void {
  if (typeof document === 'undefined') return
  const style = document.getElementById(THEME_STYLE_ELEMENT_IDS[mode])
  if (style) style.textContent = buildThemeCssRule(mode, colors)
  for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
    document.documentElement.style.removeProperty(entry.key)
  }
  for (const key of RETIRED_INLINE_COLOR_KEYS) {
    document.documentElement.style.removeProperty(key)
  }
}

/**
 * Pages rendered on the light marble artwork, so the user's dark preference is
 * ignored there. Path-only: `/` is marketing landing, never the signed-in home.
 */
export function shouldForceLightTheme(pathname: string, _signedIn = false): boolean {
  return (
    pathname === LANDING_PATH ||
    pathname === '/login' ||
    pathname.startsWith('/auth/')
  )
}

/**
 * Marks whether the server rendered this document for a signed-in visitor, so
 * the blocking boot script can resolve the landing page before React loads.
 */
export const SIGNED_IN_ATTRIBUTE = 'data-signed-in'

/**
 * Blocking `<head>` script: resolve the light/dark class before first paint.
 * Signed-in mode comes from the server; anonymous mode may use localStorage.
 */
export function getThemeBootScript(
  preferenceMode: ThemePreferenceMode = 'system',
  signedIn = false
): string {
  return `(function(){
  try {
    var root = document.documentElement;
    var path = window.location.pathname;
    var landingPath = ${JSON.stringify(LANDING_PATH)};
    var forceLight = path === landingPath
      || path === '/login'
      || path.indexOf('/auth/') === 0;
    var mode = 'light';
    if (forceLight) {
      root.classList.remove('dark');
    } else {
      var preference = ${signedIn ? JSON.stringify(preferenceMode) : "localStorage.getItem('doxa-theme') || 'system'"};
      if (preference === 'dark') {
        root.classList.add('dark');
        mode = 'dark';
      } else if (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
        mode = 'dark';
      } else {
        root.classList.remove('dark');
      }
    }
    root.setAttribute('data-theme-mode', mode);
    localStorage.removeItem('doxa-theme-colors-light');
    localStorage.removeItem('doxa-theme-colors-dark');
    localStorage.removeItem('doxa-selected-theme-preset-light');
    localStorage.removeItem('doxa-selected-theme-preset-dark');
  } catch (e) {}
})();`
}

export type ThemePresetSelection = {
  id: string
  name: string
}

export function normalizeThemeColors(
  colors: Record<string, unknown>,
  mode: ThemeMode
): Record<string, string> {
  const migrated = migrateLegacyThemeColors(colors, mode)
  const out: Record<string, string> = {}
  for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
    const raw = migrated[entry.key]
    const fallback = entry.defaults[mode]
    if (typeof raw === 'string' && isHexColor(raw)) {
      out[entry.key] = raw.toLowerCase()
    } else {
      out[entry.key] = fallback.toLowerCase()
    }
  }
  return out
}

export function captureCurrentThemeColors(mode: ThemeMode): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined') {
    for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
      out[entry.key] = entry.defaults[mode]
    }
    return out
  }
  const styles = getComputedStyle(document.documentElement)
  for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
    out[entry.key] = toPickerHex(
      styles.getPropertyValue(entry.key),
      entry.defaults[mode]
    )
  }
  return out
}

export function groupGlobalLayoutColorVars(): {
  group: string
  vars: GlobalLayoutColorVar[]
}[] {
  const order: string[] = []
  const map = new Map<string, GlobalLayoutColorVar[]>()
  for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
    if (!map.has(entry.group)) {
      map.set(entry.group, [])
      order.push(entry.group)
    }
    map.get(entry.group)!.push(entry)
  }
  return order.map((group) => ({ group, vars: map.get(group)! }))
}

export type ThemePresetRecord = {
  id: string
  name: string
  mode: ThemeMode
  colors: Record<string, string>
  created_at: string
  updated_at: string
}

/** Built-in Default themes (one per mode) cannot be deleted. */
export const PROTECTED_THEME_PRESET_NAME = 'Default'

export function isProtectedThemePresetName(name: string): boolean {
  return name.trim().toLowerCase() === PROTECTED_THEME_PRESET_NAME.toLowerCase()
}

export function mapThemePresetRow(row: {
  id: string
  name: string
  mode: string
  colors: unknown
  created_at: string
  updated_at: string
}): ThemePresetRecord | null {
  if (row.mode !== 'light' && row.mode !== 'dark') return null
  const colors =
    row.colors && typeof row.colors === 'object' && !Array.isArray(row.colors)
      ? normalizeThemeColors(row.colors as Record<string, unknown>, row.mode)
      : normalizeThemeColors({}, row.mode)
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    colors,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
