import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listFeaturedTopics, listTrendingControversies } from '@/lib/explore/queries'
import { debateRebuildPayload, isDebateRebuildMode } from '@/lib/debate-rebuild'

export async function GET() {
  if (isDebateRebuildMode()) {
    return NextResponse.json(debateRebuildPayload())
  }
  try {
    const supabase = await createClient()
    const [controversies, topics] = await Promise.all([
      listTrendingControversies(supabase, 12),
      listFeaturedTopics(supabase),
    ])
    return NextResponse.json({ controversies, topics })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load explore home'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
