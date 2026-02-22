import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

type BucketRow = { bucket: string; success_count: number; failure_count: number }

/** Returns scrape counts (success/failure). Admin only.
 *  range: 1h | 24h | 7d | 30d | 90d — controls granularity (hour vs day) and window. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const searchParams = request.nextUrl.searchParams
    const range = (searchParams.get('range') || '7d') as string

    let formatted: { day: string; success: number; failure: number }[]

    if (range === '1h') {
      const { data, error } = await supabase.rpc('get_scrape_counts_by_five_min', { p_hours: 1 })
      if (error) {
        return NextResponse.json(
          { data: null, error: { message: error.message, code: error.code } },
          { status: 500 }
        )
      }
      formatted = (data ?? []).map((row: BucketRow) => ({
        day: row.bucket,
        success: Number(row.success_count ?? 0),
        failure: Number(row.failure_count ?? 0),
      }))
    } else {
      const hours = range === '90d' ? 2160 : range === '30d' ? 720 : range === '24h' ? 24 : 168
      const { data, error } = await supabase.rpc('get_scrape_counts_by_hour', { p_hours: hours })
      if (error) {
        return NextResponse.json(
          { data: null, error: { message: error.message, code: error.code } },
          { status: 500 }
        )
      }
      formatted = (data ?? []).map((row: BucketRow) => ({
        day: row.bucket,
        success: Number(row.success_count ?? 0),
        failure: Number(row.failure_count ?? 0),
      }))
    }

    return NextResponse.json({ data: formatted, error: null })
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
