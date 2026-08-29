import { NextResponse } from 'next/server'
import { postPendingApprovalCard, verifySlackSignature } from '@/lib/l3/slack-approval'

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
  await postPendingApprovalCard(proposalUid)
  return NextResponse.json({ ok: true })
}
