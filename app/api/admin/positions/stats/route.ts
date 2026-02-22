import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

/** Returns positions/controversies/viewpoints overview metrics. Admin only. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('get_daily_health_report').single()

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const row = data as Record<string, unknown> | null
    const stats = {
      positions_24h: Number(row?.positions_24h ?? 0),
      controversies_24h: Number(row?.controversies_24h ?? 0),
      viewpoints_24h: Number(row?.viewpoints_24h ?? 0),
      positions_active: Number(row?.positions_active ?? 0),
      controversies_active: Number(row?.controversies_active ?? 0),
      viewpoints_active: Number(row?.viewpoints_active ?? 0),
    }

    return NextResponse.json({ data: stats, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
