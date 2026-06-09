import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchPaginatedEventsAudit } from '@/lib/admin/paginated-audit-fetch'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing event ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const data = await fetchPaginatedEventsAudit(supabase, id, request)
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
