import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const controversyUid = typeof body.controversy_uid === 'string' ? body.controversy_uid : ''
    if (!controversyUid) {
      return NextResponse.json({ error: 'controversy_uid required' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { error } = await supabase.from('user_saved_controversies').upsert(
      { user_id: user.id, controversy_uid: controversyUid },
      { onConflict: 'user_id,controversy_uid' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, saved: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const controversyUid = typeof body.controversy_uid === 'string' ? body.controversy_uid : ''
    if (!controversyUid) {
      return NextResponse.json({ error: 'controversy_uid required' }, { status: 400 })
    }
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { error } = await supabase
      .from('user_saved_controversies')
      .delete()
      .eq('user_id', user.id)
      .eq('controversy_uid', controversyUid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, saved: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unsave failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
