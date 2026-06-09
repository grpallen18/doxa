import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchPaginatedPositionsAudit } from '@/lib/admin/paginated-audit-fetch'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing position ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const data = await fetchPaginatedPositionsAudit(supabase, id, request)
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
