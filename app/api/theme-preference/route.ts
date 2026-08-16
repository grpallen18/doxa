import { NextResponse } from 'next/server'

import {
  type ThemeMode,
  type ThemePreferenceMode,
} from '@/lib/admin/global-layout-theme'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isPreferenceMode(value: unknown): value is ThemePreferenceMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { data: null, error: { message: 'Authentication required' } },
      { status: 401 }
    )
  }

  const { data, error } = await supabase
    .from('users')
    .select('theme_mode, theme_light_preset_id, theme_dark_preset_id')
    .eq('id', user.id)
    .single()

  if (error) {
    return NextResponse.json(
      { data: null, error: { message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { preference: data }, error: null })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { data: null, error: { message: 'Authentication required' } },
      { status: 401 }
    )
  }

  try {
    const body = (await request.json()) as {
      theme_mode?: unknown
      preset_mode?: unknown
      preset_id?: unknown
    }
    const updates: {
      theme_mode?: ThemePreferenceMode
      theme_light_preset_id?: string
      theme_dark_preset_id?: string
    } = {}

    if (body.theme_mode !== undefined) {
      if (!isPreferenceMode(body.theme_mode)) {
        return NextResponse.json(
          { data: null, error: { message: 'theme_mode must be light, dark, or system' } },
          { status: 400 }
        )
      }
      updates.theme_mode = body.theme_mode
    }

    const hasPreset = body.preset_mode !== undefined || body.preset_id !== undefined
    if (hasPreset) {
      if (
        !isThemeMode(body.preset_mode) ||
        typeof body.preset_id !== 'string' ||
        !UUID_PATTERN.test(body.preset_id)
      ) {
        return NextResponse.json(
          {
            data: null,
            error: { message: 'preset_mode and a valid preset_id are required together' },
          },
          { status: 400 }
        )
      }

      const { data: preset, error: presetError } = await supabase
        .from('theme_presets')
        .select('id, mode')
        .eq('id', body.preset_id)
        .maybeSingle()

      if (presetError) {
        return NextResponse.json(
          { data: null, error: { message: presetError.message } },
          { status: 500 }
        )
      }
      if (!preset || preset.mode !== body.preset_mode) {
        return NextResponse.json(
          { data: null, error: { message: 'Theme preset not found for that mode' } },
          { status: 404 }
        )
      }

      if (body.preset_mode === 'light') {
        updates.theme_light_preset_id = preset.id
      } else {
        updates.theme_dark_preset_id = preset.id
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No theme preference changes supplied' } },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select('theme_mode, theme_light_preset_id, theme_dark_preset_id')
      .single()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { preference: data }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
