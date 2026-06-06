import { NextRequest, NextResponse } from 'next/server'
import { createClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { extractErrorMessage, fetchStoryExtractionReview } from '@/lib/admin/story-extraction-review'

/** Full extraction review payload for one story. Admin only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing story ID' } },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()
    const payload = await fetchStoryExtractionReview(supabase, id)

    if (!payload) {
      return NextResponse.json(
        { data: null, error: { message: 'Story not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: payload, error: null })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = formatSupabaseAdminError(extractErrorMessage(error))
    console.error('[extraction-review]', id, message, error)
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
