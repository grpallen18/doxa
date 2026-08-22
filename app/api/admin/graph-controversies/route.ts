import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

const VALID_STATUSES = new Set(['all', 'open', 'developing', 'closed'])

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const statusFilter = searchParams.get('status')?.trim() || 'all'

  const supabase = createAdminClient()
  let query = supabase
    .from('graph_controversies')
    .select(
      'uid, title, question, summary, sides_count, source_count, topic_key, status, publish_block_reason, updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(100)

  if (VALID_STATUSES.has(statusFilter) && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { items: data ?? [] } })
}
