import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ uid: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { uid } = await params
  const supabase = createAdminClient()

  const { data: controversy, error } = await supabase
    .from('graph_controversies')
    .select(
      'uid, title, question, summary, sides_count, source_count, topic_key, status, publish_block_reason, updated_at'
    )
    .eq('uid', uid)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!controversy) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [vpRes, evRes, assessRes] = await Promise.all([
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
    supabase
      .from('graph_assessments')
      .select(
        'uid, kind, summary, confidence, method_run_uid, layer, updated_at'
      )
      .eq('target_kind', 'controversy')
      .eq('target_uid', uid)
      .order('updated_at', { ascending: false }),
  ])

  const detailError = vpRes.error ?? evRes.error ?? assessRes.error
  if (detailError) {
    return NextResponse.json({ error: detailError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      controversy,
      viewpoints: vpRes.data ?? [],
      evidence: evRes.data ?? [],
      assessments: assessRes.data ?? [],
    },
  })
}
