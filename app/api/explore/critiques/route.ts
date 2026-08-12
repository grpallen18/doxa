import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const REASONS = new Set(['missing_fact', 'bad_representation', 'weak_support', 'other'])
const KINDS = new Set(['controversy', 'viewpoint', 'proposition'])

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const targetKind = typeof body.target_kind === 'string' ? body.target_kind : ''
    const targetUid = typeof body.target_uid === 'string' ? body.target_uid : ''
    const reason = typeof body.reason === 'string' ? body.reason : ''
    const detail = typeof body.detail === 'string' ? body.detail : null

    if (!KINDS.has(targetKind) || !targetUid || !REASONS.has(reason)) {
      return NextResponse.json({ error: 'Invalid critique payload' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { error } = await supabase.from('user_critiques').insert({
      user_id: user.id,
      target_kind: targetKind,
      target_uid: targetUid,
      reason,
      detail,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Critique failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
