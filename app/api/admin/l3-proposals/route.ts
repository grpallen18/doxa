import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')?.trim() || 'pending_approval'
  const supabase = createAdminClient()

  let query = supabase
    .from('l3_proposals')
    .select('*, l3_proposal_ops(*)')
    .order('created_at', { ascending: false })
    .limit(80)
  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { items: data ?? [] } })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const supabase = createAdminClient()
  const action = String(body.action ?? '')
  const proposalUid = String(body.proposal_uid ?? '')
  if (!proposalUid) return NextResponse.json({ error: 'proposal_uid required' }, { status: 400 })

  if (action === 'reject') {
    const opIndex = body.op_index
    if (typeof opIndex === 'number') {
      const { data: op } = await supabase
        .from('l3_proposal_ops')
        .update({ status: 'rejected', gold_negative: true })
        .eq('proposal_uid', proposalUid)
        .eq('op_index', opIndex)
        .select('op_type, payload')
        .maybeSingle()
      const payload = (op?.payload ?? {}) as { prop_uid?: string }
      await supabase.from('l3_gold_negatives').insert({
        question_uid: String(body.question_uid ?? ''),
        prop_uid: payload.prop_uid ?? null,
        op_type: op?.op_type ?? 'ADMIT',
        reason: String(body.reason ?? 'admin_reject'),
        proposal_uid: proposalUid,
      })
    } else {
      await supabase
        .from('l3_proposals')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('proposal_uid', proposalUid)
      const { data: ops } = await supabase
        .from('l3_proposal_ops')
        .update({ status: 'rejected', gold_negative: true })
        .eq('proposal_uid', proposalUid)
        .select('op_type, payload')
      for (const op of ops ?? []) {
        const payload = (op.payload ?? {}) as { prop_uid?: string }
        await supabase.from('l3_gold_negatives').insert({
          question_uid: String(body.question_uid ?? ''),
          prop_uid: payload.prop_uid ?? null,
          op_type: op.op_type,
          reason: String(body.reason ?? 'admin_reject'),
          proposal_uid: proposalUid,
        })
      }
    }
    return NextResponse.json({ data: { ok: true } })
  }

  if (action === 'validate') {
    await supabase
      .from('l3_proposals')
      .update({ status: 'validated', updated_at: new Date().toISOString() })
      .eq('proposal_uid', proposalUid)
    return NextResponse.json({ data: { ok: true } })
  }

  if (action === 'accept_op') {
    const opIndex = body.op_index
    if (typeof opIndex !== 'number') {
      return NextResponse.json({ error: 'op_index required' }, { status: 400 })
    }
    await supabase
      .from('l3_proposal_ops')
      .update({ status: 'accepted' })
      .eq('proposal_uid', proposalUid)
      .eq('op_index', opIndex)
    return NextResponse.json({ data: { ok: true } })
  }

  if (action === 'apply' || action === 'revert') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server not configured for Edge Function calls' }, { status: 503 })
    }
    const payload =
      action === 'revert'
        ? { revert_proposal_uid: proposalUid }
        : {
            proposal_uid: proposalUid,
            force_apply_all: true,
          }
    const res = await fetch(`${supabaseUrl}/functions/v1/apply_l3_proposals`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: json?.error ?? `HTTP ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ data: json })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
