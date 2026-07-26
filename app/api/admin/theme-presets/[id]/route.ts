import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import {
  normalizeThemeColors,
  isProtectedThemePresetName,
  type ThemeMode,
  type ThemePresetRecord,
} from '@/lib/admin/global-layout-theme'

type RouteContext = {
  params: Promise<{ id: string }>
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

function mapRow(row: {
  id: string
  name: string
  mode: string
  colors: unknown
  created_at: string
  updated_at: string
}): ThemePresetRecord | null {
  if (!isThemeMode(row.mode)) return null
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

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'Missing preset id' } },
        { status: 400 }
      )
    }

    const body = (await request.json()) as { colors?: unknown }
    if (!body.colors || typeof body.colors !== 'object' || Array.isArray(body.colors)) {
      return NextResponse.json(
        { data: null, error: { message: 'colors must be an object' } },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data: existing, error: existingError } = await supabase
      .from('theme_presets')
      .select('id, mode')
      .eq('id', id)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { data: null, error: { message: existingError.message } },
        { status: 500 }
      )
    }
    if (!existing || !isThemeMode(existing.mode)) {
      return NextResponse.json(
        { data: null, error: { message: 'Preset not found' } },
        { status: 404 }
      )
    }

    const colors = normalizeThemeColors(
      body.colors as Record<string, unknown>,
      existing.mode
    )

    const { data, error } = await supabase
      .from('theme_presets')
      .update({
        colors,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, mode, colors, created_at, updated_at')
      .single()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    const preset = mapRow(data)
    if (!preset) {
      return NextResponse.json(
        { data: null, error: { message: 'Updated but failed to map preset' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { preset }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'Missing preset id' } },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { data: existing, error: lookupError } = await supabase
      .from('theme_presets')
      .select('id, name, mode')
      .eq('id', id)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json(
        { data: null, error: { message: lookupError.message } },
        { status: 500 }
      )
    }
    if (!existing) {
      return NextResponse.json(
        { data: null, error: { message: 'Preset not found' } },
        { status: 404 }
      )
    }
    if (isProtectedThemePresetName(existing.name)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `The “${existing.name}” ${existing.mode} theme cannot be deleted.`,
          },
        },
        { status: 403 }
      )
    }

    const { error, count } = await supabase
      .from('theme_presets')
      .delete({ count: 'exact' })
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }
    if (!count) {
      return NextResponse.json(
        { data: null, error: { message: 'Preset not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
