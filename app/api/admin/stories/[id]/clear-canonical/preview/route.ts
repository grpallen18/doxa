import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { fetchClearCanonicalPreview } from '@/lib/admin/clear-canonical-preview'
import { extractErrorMessage } from '@/lib/admin/story-extraction-review'

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
    const supabase = await createClient()
    const data = await fetchClearCanonicalPreview(supabase, storyId)
    return NextResponse.json({ data, error: null })
  } catch (error: unknown) {
    const message = extractErrorMessage(error)
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
