import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CHOICES = new Set(['agree', 'disagree', 'unsure'])

export async function GET(request: NextRequest) {
  try {
    const targetUid = request.nextUrl.searchParams.get('target_uid')
    if (!targetUid) return NextResponse.json({ error: 'target_uid required' }, { status: 400 })
    const supabase = await createClient()
    const { data: polls } = await supabase
      .from('explore_polls')
      .select('poll_id, question, target_kind, target_uid')
      .eq('target_uid', targetUid)
    return NextResponse.json({ polls: polls ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load polls'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const pollId = typeof body.poll_id === 'string' ? body.poll_id : ''
    const choice = typeof body.choice === 'string' ? body.choice : ''
    if (!pollId || !CHOICES.has(choice)) {
      return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { error } = await supabase.from('explore_poll_votes').upsert(
      { poll_id: pollId, user_id: user.id, choice },
      { onConflict: 'poll_id,user_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Vote failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
