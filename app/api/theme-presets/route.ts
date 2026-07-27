import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  mapThemePresetRow,
  type ThemeMode,
  type ThemePresetRecord,
} from '@/lib/admin/global-layout-theme'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark'
}

/** Authenticated users can list theme presets (RLS SELECT). */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      return NextResponse.json(
        { data: null, error: { message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const modeParam = searchParams.get('mode')

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
