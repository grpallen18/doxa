import { LANDING_PATH } from '@/lib/constants'

export type ThemeMode = 'light' | 'dark'

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
    defaults: { light: '#ffffff', dark: '#151515' },
  },
  {
    key: '--surface',
    label: 'Surface',
    group: 'Surfaces',
    defaults: { light: '#faf9f7', dark: '#1e1e1e' },
  },
  {
    key: '--surface-soft',
    label: 'Surface soft',
    group: 'Surfaces',
    defaults: { light: '#ffffff', dark: '#2a2a2a' },
  },
  {
    key: '--surface-section',
    label: 'Surface section',
    group: 'Surfaces',
    defaults: { light: '#f5f3f0', dark: '#252525' },
  },
  {
    key: '--border',
    label: 'Border',
    group: 'Borders',
    defaults: { light: '#ebe7e2', dark: '#333333' },
  },
  {
    key: '--foreground',
    label: 'Foreground',
    group: 'Text',
    defaults: { light: '#1a1712', dark: '#e8e6e3' },
  },
  {
    key: '--muted',
    label: 'Muted text',
    group: 'Text',
    defaults: { light: '#3f3629', dark: '#b4b4b4' },
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
    defaults: { light: '#2d5a4a', dark: '#f0edea' },
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
    defaults: { light: '#a68b6d', dark: '#e0ddd9' },
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
    defaults: { light: '#3d5a80', dark: '#b8c4d4' },
  },
  {
    key: '--accent-tertiary-foreground',
    label: 'Accent tertiary foreground',
    group: 'Accents',
    defaults: { light: '#faf9f7', dark: '#1a1712' },
  },
  {
    key: '--destructive',
    label: 'Destructive',
    group: 'Status',
    defaults: { light: '#dc2626', dark: '#7f1d1d' },
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
    defaults: { light: '#16a34a', dark: '#166534' },
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
    defaults: { light: '#0000ee', dark: '#008000' },
  },
  {
    key: '--link-accent-hover',
    label: 'Link hover',
    group: 'Links',
    defaults: { light: '#3358f5', dark: '#00c400' },
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

const STORAGE_PREFIX = 'doxa-theme-colors'

export function themeColorsStorageKey(mode: ThemeMode): string {
  return `${STORAGE_PREFIX}-${mode}`
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

export function loadThemeColorOverrides(mode: ThemeMode): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(themeColorsStorageKey(mode))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return migrateLegacyThemeColors(parsed as Record<string, unknown>, mode)
  } catch {
    return {}
  }
}

export function saveThemeColorOverrides(
  mode: ThemeMode,
  overrides: Record<string, string>
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    themeColorsStorageKey(mode),
    JSON.stringify(migrateLegacyThemeColors(overrides, mode))
  )
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

export function applyThemeColorOverrides(
  mode: ThemeMode,
  overrides: Record<string, string> = loadThemeColorOverrides(mode)
): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const entry of GLOBAL_LAYOUT_COLOR_VARS) {
    root.style.removeProperty(entry.key)
  }
  for (const key of RETIRED_INLINE_COLOR_KEYS) {
    root.style.removeProperty(key)
  }
  const allowed = allowedColorKeys()
  const migrated = migrateLegacyThemeColors(overrides, mode)
  for (const [key, value] of Object.entries(migrated)) {
    if (!allowed.has(key)) continue
    if (isHexColor(value)) root.style.setProperty(key, value.toLowerCase())
  }
}

export function clearThemeColorOverrides(mode: ThemeMode): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(themeColorsStorageKey(mode))
  applyThemeColorOverrides(mode, {})
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
 * Blocking `<head>` script: light/dark class + localStorage color overrides
 * before first paint (avoids FOUC of default CSS variables).
 */
export function getThemeBootScript(): string {
  const allowedKeys = JSON.stringify(
    GLOBAL_LAYOUT_COLOR_VARS.map((entry) => entry.key)
  )
  const retiredKeys = JSON.stringify([...RETIRED_INLINE_COLOR_KEYS])
  const legacyMap = JSON.stringify(LEGACY_COLOR_KEY_MAP)
  const colorsPrefix = JSON.stringify(STORAGE_PREFIX)

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
      var stored = localStorage.getItem('doxa-theme');
      if (stored === 'dark') {
        root.classList.add('dark');
        mode = 'dark';
      } else if (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
        mode = 'dark';
      } else {
        root.classList.remove('dark');
      }
    }

    var allowed = ${allowedKeys};
    var retired = ${retiredKeys};
    var legacyMap = ${legacyMap};
    var allowedSet = Object.create(null);
    for (var i = 0; i < allowed.length; i++) allowedSet[allowed[i]] = true;

    for (var r = 0; r < retired.length; r++) root.style.removeProperty(retired[r]);
    for (var a = 0; a < allowed.length; a++) root.style.removeProperty(allowed[a]);

    var raw = localStorage.getItem(${colorsPrefix} + '-' + mode);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    var hex = /^#[0-9a-fA-F]{6}$/;
    var out = Object.create(null);
    for (var key in parsed) {
      if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
      var val = parsed[key];
      if (typeof val === 'string' && hex.test(val.trim()) && allowedSet[key]) {
        out[key] = val.trim().toLowerCase();
      }
    }
    for (var legacy in legacyMap) {
      if (!Object.prototype.hasOwnProperty.call(legacyMap, legacy)) continue;
      var target = legacyMap[legacy];
      if (out[target]) continue;
      var lv = parsed[legacy];
      if (typeof lv === 'string' && hex.test(lv.trim()) && allowedSet[target]) {
        out[target] = lv.trim().toLowerCase();
      }
    }
    if (!out['--link-accent']) {
      var linkKey = mode === 'dark' ? '--link-default-green' : '--link-default-blue';
      var linkVal = parsed[linkKey];
      if (typeof linkVal === 'string' && hex.test(linkVal.trim())) {
        out['--link-accent'] = linkVal.trim().toLowerCase();
      }
    }
    if (!out['--link-accent-hover']) {
      var linkHoverKey = mode === 'dark' ? '--link-default-green-hover' : '--link-default-blue-hover';
      var linkHoverVal = parsed[linkHoverKey];
      if (typeof linkHoverVal === 'string' && hex.test(linkHoverVal.trim())) {
        out['--link-accent-hover'] = linkHoverVal.trim().toLowerCase();
      }
    }
    for (var applyKey in out) {
      if (Object.prototype.hasOwnProperty.call(out, applyKey)) {
        root.style.setProperty(applyKey, out[applyKey]);
      }
    }
  } catch (e) {}
})();`
}

const SELECTED_PRESET_PREFIX = 'doxa-selected-theme-preset'

export type ThemePresetSelection = {
  id: string
  name: string
}

export function selectedThemePresetStorageKey(mode: ThemeMode): string {
  return `${SELECTED_PRESET_PREFIX}-${mode}`
}

export function loadSelectedThemePreset(mode: ThemeMode): ThemePresetSelection | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(selectedThemePresetStorageKey(mode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const id = (parsed as { id?: unknown }).id
    const name = (parsed as { name?: unknown }).name
    if (typeof id !== 'string' || typeof name !== 'string') return null
    return { id, name }
  } catch {
    return null
  }
}

export function saveSelectedThemePreset(
  mode: ThemeMode,
  selection: ThemePresetSelection | null
): void {
  if (typeof window === 'undefined') return
  const key = selectedThemePresetStorageKey(mode)
  if (!selection) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(selection))
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

/**
 * Persist a preset for its mode, switch light/dark if needed, then apply colors.
 * Same path as the admin “Load theme” action.
 */
export function applyThemePreset(
  preset: Pick<ThemePresetRecord, 'id' | 'name' | 'mode' | 'colors'>,
  setTheme?: (mode: ThemeMode) => void
): ThemePresetSelection {
  const selection = { id: preset.id, name: preset.name }
  // Persist colors for this mode first so ThemeProvider picks them up on switch.
  saveThemeColorOverrides(preset.mode, preset.colors)
  saveSelectedThemePreset(preset.mode, selection)
  setTheme?.(preset.mode)
  applyThemeColorOverrides(preset.mode, preset.colors)
  return selection
}
