import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { gatherCachedAdminHealthSnapshot } from '@/lib/admin/gather-admin-health-snapshot'
import { createAdminClient } from '@/lib/supabase/server'

const SNAPSHOT_MAX_AGE_SEC = 15

/** Live pipeline snapshot KPIs for admin dashboard polling. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminClient()
    const data = await gatherCachedAdminHealthSnapshot(supabase)
    return NextResponse.json(
      { data, error: null },
      {
        headers: {
          'Cache-Control': `private, max-age=${SNAPSHOT_MAX_AGE_SEC}, stale-while-revalidate=30`,
        },
      }
    )
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
