import 'server-only'

import {
  mapThemePresetRow,
  normalizeThemeColors,
  PROTECTED_THEME_PRESET_NAME,
  type ThemeColorsByMode,
  type ThemeMode,
  type ThemePreferenceMode,
  type ThemePresetRecord,
  type ThemePresetSelection,
} from '@/lib/admin/global-layout-theme'
import { createClient } from '@/lib/supabase/server'

export type ServerThemeState = {
  colors: ThemeColorsByMode
  preferenceMode: ThemePreferenceMode
  selections: Record<ThemeMode, ThemePresetSelection | null>
}

const FALLBACK_STATE: ServerThemeState = {
  colors: {
    light: normalizeThemeColors({}, 'light'),
    dark: normalizeThemeColors({}, 'dark'),
  },
  preferenceMode: 'system',
  selections: {
    light: null,
    dark: null,
  },
}

function isPreferenceMode(value: unknown): value is ThemePreferenceMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function resolvePreset(
  presets: ThemePresetRecord[],
  mode: ThemeMode,
  selectedId: unknown
): ThemePresetRecord | null {
  const selected =
    typeof selectedId === 'string'
      ? presets.find((preset) => preset.id === selectedId && preset.mode === mode)
      : null
  if (selected) return selected

  return (
    presets.find(
      (preset) =>
        preset.mode === mode &&
        preset.name.trim().toLowerCase() === PROTECTED_THEME_PRESET_NAME.toLowerCase()
    ) ?? null
  )
}

export async function getServerThemeState(userId?: string): Promise<ServerThemeState> {
  try {
    const supabase = await createClient()
    const [catalogResult, preferenceResult] = await Promise.all([
      supabase
        .from('theme_presets')
        .select('id, name, mode, colors, created_at, updated_at')
        .order('name', { ascending: true }),
      userId
        ? supabase
            .from('users')
            .select('theme_mode, theme_light_preset_id, theme_dark_preset_id')
            .eq('id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (catalogResult.error) return FALLBACK_STATE

    const presets = (catalogResult.data ?? [])
      .map(mapThemePresetRow)
      .filter((preset): preset is ThemePresetRecord => preset != null)
    const preference = preferenceResult.error ? null : preferenceResult.data
    const light = resolvePreset(presets, 'light', preference?.theme_light_preset_id)
    const dark = resolvePreset(presets, 'dark', preference?.theme_dark_preset_id)

    return {
      colors: {
        light: light?.colors ?? FALLBACK_STATE.colors.light,
        dark: dark?.colors ?? FALLBACK_STATE.colors.dark,
      },
      preferenceMode: isPreferenceMode(preference?.theme_mode)
        ? preference.theme_mode
        : 'system',
      selections: {
        light: light ? { id: light.id, name: light.name } : null,
        dark: dark ? { id: dark.id, name: dark.name } : null,
      },
    }
  } catch {
    return FALLBACK_STATE
  }
}
