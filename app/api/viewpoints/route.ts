import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  try {
    const topicId = request.nextUrl.searchParams.get('topic_id')

    let query = supabase
      .from('viewpoints')
      .select('*')
      .order('title', { ascending: true })

    if (topicId) {
      query = query.eq('topic_id', topicId)
    }

    const { data: viewpoints, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: viewpoints ?? [], error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
