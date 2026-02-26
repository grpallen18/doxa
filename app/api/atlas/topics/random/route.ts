import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns a random topic_id that has linked controversies for the Atlas default view. */
export async function GET() {
  const supabase = await createClient()
  try {
    const { data: rows, error } = await supabase
      .from('topic_controversies')
      .select('topic_id')
      .limit(100)

    if (error || !rows?.length) {
      return NextResponse.json({ data: null, error: error?.message ?? 'No topics with controversies found' })
    }

    const uniqueTopicIds = [...new Set((rows ?? []).map((r) => r.topic_id as string))]
    const random = uniqueTopicIds[Math.floor(Math.random() * uniqueTopicIds.length)]
    return NextResponse.json({ data: { id: random }, error: null })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ data: null, error: message }, { status: 500 })
  }
}
