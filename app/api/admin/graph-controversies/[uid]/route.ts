import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ uid: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { uid } = await params
  const supabase = await createClient()

  const { data: controversy, error } = await supabase
    .from('graph_controversies')
    .select('uid, title, summary, sides_count, topic_key, updated_at')
    .eq('uid', uid)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!controversy) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: viewpoints }, { data: evidence }] = await Promise.all([
    supabase
      .from('graph_viewpoints')
      .select('uid, label, summary, topic_key, member_count, updated_at')
      .eq('controversy_uid', uid)
      .order('member_count', { ascending: false }),
    supabase
      .from('graph_controversy_evidence')
      .select('document_uid, utterance_count, updated_at')
      .eq('controversy_uid', uid)
      .order('utterance_count', { ascending: false }),
  ])

  return NextResponse.json({
    data: {
      controversy,
      viewpoints: viewpoints ?? [],
      evidence: evidence ?? [],
    },
  })
}
