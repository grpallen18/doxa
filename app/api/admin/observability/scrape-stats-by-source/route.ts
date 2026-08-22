import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

type SourceRow = {
  domain: string
  total: number
  successes: number
  failures: number
}

/** Returns scrape stats by domain for the last 24h. Admin only. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('get_scrape_stats_by_source')

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const formatted = (data ?? []).map((row: SourceRow) => ({
      domain: row.domain,
      total: Number(row.total ?? 0),
      successes: Number(row.successes ?? 0),
      failures: Number(row.failures ?? 0),
    }))

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
