import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchStoryChunksHistory } from '@/lib/admin/history'
import { resolveStoryIdParam } from '@/lib/admin/resolve-admin-story-route'
import { resolveChunkIndex } from '@/lib/admin/resolve-chunk-ref'

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
    const resolved = await resolveStoryIdParam(supabase, id)
    if ('response' in resolved) return resolved.response

    const chunkIndex = await resolveChunkIndex(supabase, resolved.storyUuid, chunkRef)
    if (chunkIndex == null) {
      return NextResponse.json(
        { data: null, error: { message: 'Chunk not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const events = await fetchStoryChunksHistory(supabase, resolved.storyUuid, chunkIndex)
    return NextResponse.json({ data: { events }, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
