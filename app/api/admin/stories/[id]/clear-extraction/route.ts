import { NextRequest, NextResponse } from 'next/server'
import { createClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'

/** Admin: reset story extraction to chunks awaiting extraction. */
export async function POST(
  request: NextRequest,
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

  let body: { confirm?: boolean } = {}
  try {
    const raw = await request.json()
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      body = raw as { confirm?: boolean }
    }
  } catch {
    body = {}
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { data: null, error: { message: 'Pass { confirm: true } to clear extraction data' } },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('reset_story_extraction', {
      p_story_id: storyId,
    })

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: formatSupabaseAdminError(error.message) } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = formatSupabaseAdminError(extractErrorMessage(error))
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
