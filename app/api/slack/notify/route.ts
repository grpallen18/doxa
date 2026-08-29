import { NextResponse } from 'next/server'
import { postPendingApprovalCard } from '@/lib/l3/slack-approval'

export const runtime = 'nodejs'

function authorized(req: Request): boolean {
  const header = req.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const secrets = [process.env.SLACK_NOTIFY_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
  return Boolean(token && secrets.includes(token))
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const proposalUid = String(body.proposal_uid ?? '')
  if (!proposalUid) return NextResponse.json({ error: 'proposal_uid required' }, { status: 400 })

  const result = await postPendingApprovalCard(proposalUid)
  if (result.skipped) {
    return NextResponse.json({ ok: false, skipped: true, reason: result.skipReason }, { status: 200 })
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'slack_post_failed' },
      { status: 500 }
    )
  }
  return NextResponse.json({
    ok: true,
    thread_ts: result.threadTs,
    used_fallback: result.usedFallback ?? false,
    warning: result.usedFallback ? result.error : undefined,
  })
}
