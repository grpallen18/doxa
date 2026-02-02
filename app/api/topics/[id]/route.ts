import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TopicWithDetails } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  try {
    const topicId = params.id

    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('topic_id', topicId)
      .single()

    if (topicError || !topic) {
      return NextResponse.json(
        { data: null, error: { message: 'Topic not found', code: 'NOT_FOUND' } },
        { status: 404 }
      )
    }

    const { data: viewpoints, error: viewpointsError } = await supabase
      .from('viewpoints')
      .select('*')
      .eq('topic_id', topicId)
      .order('title', { ascending: true })

    if (viewpointsError) {
      console.error('Error fetching viewpoints:', viewpointsError)
    }

    const topicWithDetails: TopicWithDetails = {
      ...topic,
      viewpoints: viewpoints || [],
    }

    return NextResponse.json({ data: topicWithDetails, error: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { data: null, error: { message } },
      { status: 500 }
    )
  }
}
