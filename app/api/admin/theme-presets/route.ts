import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  mapThemePresetRow,
  normalizeThemeColors,
  type ThemeMode,
  type ThemePresetRecord,
} from '@/lib/admin/global-layout-theme'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const modeParam = searchParams.get('mode')
    const supabase = createAdminClient()

    let query = supabase
      .from('theme_presets')
      .select('id, name, mode, colors, created_at, updated_at')
      .order('name', { ascending: true })

    if (modeParam) {
      if (!isThemeMode(modeParam)) {
        return NextResponse.json(
          { data: null, error: { message: 'mode must be light or dark' } },
          { status: 400 }
        )
      }
      query = query.eq('mode', modeParam)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    const presets = (data ?? [])
      .map(mapThemePresetRow)
      .filter((row): row is ThemePresetRecord => row != null)

    return NextResponse.json({ data: { presets }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const body = (await request.json()) as {
      name?: unknown
      mode?: unknown
      colors?: unknown
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      return NextResponse.json(
        { data: null, error: { message: 'Name is required (max 80 characters)' } },
        { status: 400 }
      )
    }
    if (!isThemeMode(body.mode)) {
      return NextResponse.json(
        { data: null, error: { message: 'mode must be light or dark' } },
        { status: 400 }
      )
    }
    if (!body.colors || typeof body.colors !== 'object' || Array.isArray(body.colors)) {
      return NextResponse.json(
        { data: null, error: { message: 'colors must be an object' } },
        { status: 400 }
      )
    }

    const colors = normalizeThemeColors(
      body.colors as Record<string, unknown>,
      body.mode
    )
    const supabase = createAdminClient()

    const { data: existing, error: existingError } = await supabase
      .from('theme_presets')
      .select('id, name')
      .eq('mode', body.mode)

    if (existingError) {
      return NextResponse.json(
        { data: null, error: { message: existingError.message } },
        { status: 500 }
      )
    }

    const nameKey = name.toLowerCase()
    const duplicate = (existing ?? []).find(
      (row) => typeof row.name === 'string' && row.name.trim().toLowerCase() === nameKey
    )
    if (duplicate) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `A ${body.mode} theme named "${duplicate.name}" already exists.`,
            conflictId: duplicate.id,
            conflictName: duplicate.name,
          },
        },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('theme_presets')
      .insert({
        name,
        mode: body.mode,
        colors,
        created_by: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .select('id, name, mode, colors, created_at, updated_at')
      .single()

    if (error) {
      const message =
        error.code === '23505'
          ? `A ${body.mode} theme named "${name}" already exists. Names must be unique within ${body.mode} mode.`
          : error.message
      return NextResponse.json(
        { data: null, error: { message } },
        { status: error.code === '23505' ? 409 : 500 }
      )
    }

    const preset = mapThemePresetRow(data)
    if (!preset) {
      return NextResponse.json(
        { data: null, error: { message: 'Saved but failed to map preset' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { preset }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
