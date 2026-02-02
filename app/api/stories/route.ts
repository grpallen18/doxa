import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  try {
    const limit = Math.min(
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '6', 10)),
      50
    )

    const { data: rows, error } = await supabase
      .from('stories')
      .select('story_id, title, url, created_at, sources(name)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    const data = (rows ?? []).map((row: { story_id: string; title: string; url: string; created_at: string; sources: { name: string } | null }) => ({
      story_id: row.story_id,
      title: row.title,
      url: row.url,
      created_at: row.created_at,
      source_name: row.sources?.name ?? null,
    }))

    return NextResponse.json({ data, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
