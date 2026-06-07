import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { buildStoryAuditEvents } from '@/lib/admin/story-audit'
import { fetchStoryExtractionReview, extractErrorMessage } from '@/lib/admin/story-extraction-review'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id: storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing story ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = createAdminClient()
    const payload = await fetchStoryExtractionReview(supabase, storyId)
    if (!payload) {
      return NextResponse.json(
        { data: null, error: { message: 'Story not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const events = await buildStoryAuditEvents(supabase, storyId, payload)
    return NextResponse.json({ data: { events }, error: null })
  } catch (error: unknown) {
    return NextResponse.json(
      { data: null, error: { message: extractErrorMessage(error) } },
      { status: 500 }
    )
  }
}
