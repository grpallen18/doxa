import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns content_clean for a single story. Load only when user explicitly opens a story. */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const storyId = params.id

    if (!storyId) {
      return NextResponse.json(
        { data: null, error: { message: 'Story ID required', code: 'BAD_REQUEST' } },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('story_bodies')
      .select('content_clean')
      .eq('story_id', storyId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: 'Story content not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: { content_clean: data.content_clean ?? null },
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
