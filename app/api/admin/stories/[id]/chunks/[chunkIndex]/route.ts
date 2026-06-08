import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchChunkRecord } from '@/lib/admin/chunk-record'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chunkIndex: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id, chunkIndex: chunkRef } = await params
  if (!id || !chunkRef?.trim()) {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid story or chunk ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const data = await fetchChunkRecord(supabase, id, chunkRef)
    if (!data) {
      return NextResponse.json(
        { data: null, error: { message: 'Chunk not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
