import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchPositionRecordHub } from '@/lib/admin/record-hub/positions'

export async function GET(
  _request: NextRequest,
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
    const data = await fetchPositionRecordHub(supabase, id)
    if (!data) {
      return NextResponse.json(
        { data: null, error: { message: 'Position not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
