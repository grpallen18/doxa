import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Aggregate critiques for revision gating (P3).
 * Returns targets whose critique count meets a simple threshold.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_critiques')
      .select('target_kind, target_uid, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const counts = new Map<string, { target_kind: string; target_uid: string; count: number }>()
    for (const row of data ?? []) {
      const key = `${row.target_kind}:${row.target_uid}`
      const prev = counts.get(key)
      if (prev) prev.count += 1
      else {
        counts.set(key, {
          target_kind: row.target_kind as string,
          target_uid: row.target_uid as string,
          count: 1,
        })
      }
    }

    const REVISION_THRESHOLD = 3
    const candidates = [...counts.values()]
      .filter((c) => c.count >= REVISION_THRESHOLD)
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      threshold: REVISION_THRESHOLD,
      candidates,
      note: 'Revision gate is advisory until topic_version publishing is wired.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
