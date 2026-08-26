import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { gatherAdminHealthMetrics } from '@/lib/admin/gather-health-metrics'
import { parseMetricRange } from '@/lib/admin/metric-range'
import { createAdminClient } from '@/lib/supabase/server'

/** Pipeline health metric tiles for Observability Key Metrics. Query: ?range=7d|30d|3m|6m|1y */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const range = parseMetricRange(request.nextUrl.searchParams.get('range'))
    const supabase = createAdminClient()
    const data = await gatherAdminHealthMetrics(supabase, range)
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
