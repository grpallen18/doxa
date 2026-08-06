import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  mergeNeoKindColors,
  NEO_KIND_COLOR_DEFAULTS,
  normalizeNeoKindColorMap,
  type NeoKindColorMap,
} from '@/lib/admin/neo-graph/colors'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('neo_kind_colors')
      .select('colors, updated_at')
      .eq('id', 'default')
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    const colors = mergeNeoKindColors(
      (data?.colors as Partial<NeoKindColorMap> | null) ?? null
    )

    return NextResponse.json({
      data: {
        colors,
        updatedAt: data?.updated_at ?? null,
        isDefault: Object.keys(data?.colors ?? {}).length === 0,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const body = (await request.json()) as {
      colors?: unknown
      reset?: unknown
    }

    const reset = body.reset === true
    const colors = reset
      ? { ...NEO_KIND_COLOR_DEFAULTS }
      : normalizeNeoKindColorMap(body.colors)

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('neo_kind_colors')
      .upsert(
        {
          id: 'default',
          colors: reset ? {} : colors,
          updated_at: new Date().toISOString(),
          updated_by: auth.user.id,
        },
        { onConflict: 'id' }
      )
      .select('colors, updated_at')
      .single()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message } },
        { status: 500 }
      )
    }

    const merged = mergeNeoKindColors(
      (data?.colors as Partial<NeoKindColorMap> | null) ?? null
    )

    return NextResponse.json({
      data: {
        colors: merged,
        updatedAt: data?.updated_at ?? null,
        isDefault: reset || Object.keys(data?.colors ?? {}).length === 0,
      },
      error: null,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
