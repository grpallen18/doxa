import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTopicHub } from '@/lib/explore/queries'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { slug } = await params
    const supabase = await createClient()
    const hub = await getTopicHub(supabase, slug)
    if (!hub) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })
    return NextResponse.json(hub)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load topic'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
