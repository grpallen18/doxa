import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ storyId: string }> }

/** Passage text for utterance highlighting. Admin only. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { storyId } = await params
  if (!storyId) {
    return NextResponse.json(
      { data: null, error: { message: 'storyId required' } },
      { status: 400 }
    )
  }

  try {
    const supabase = await createClient()
    const [{ data: story }, { data: body }] = await Promise.all([
      supabase
        .from('stories')
        .select('story_id, title, graph_status, url')
        .eq('story_id', storyId)
        .maybeSingle(),
      supabase
        .from('story_bodies')
        .select('content_clean')
        .eq('story_id', storyId)
        .maybeSingle(),
    ])

    if (!story) {
      return NextResponse.json(
        { data: null, error: { message: 'Story not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: {
        story_id: story.story_id,
        title: story.title,
        graph_status: story.graph_status,
        url: story.url,
        content_clean: (body?.content_clean as string | null) ?? '',
      },
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load passage'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
