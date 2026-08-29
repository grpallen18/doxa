import { NextResponse } from 'next/server'
import { recordApprovalDecision, verifySlackSignature } from '@/lib/l3/slack-approval'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const raw = await request.text()
  const secret = process.env.SLACK_SIGNING_SECRET ?? ''
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''
  const signature = request.headers.get('x-slack-signature') ?? ''
  if (!secret || !verifySlackSignature(secret, timestamp, raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const form = new URLSearchParams(raw)
  const payloadRaw = form.get('payload') ?? raw
  const payload = JSON.parse(payloadRaw) as {
    type?: string
    user?: { id?: string }
    channel?: { id?: string }
    message?: { ts?: string; thread_ts?: string }
    actions?: Array<{ action_id?: string; value?: string }>
    container?: { thread_ts?: string; message_ts?: string }
  }

  const action = payload.actions?.[0]
  const proposalUid = action?.value ?? ''
  if (!proposalUid || !payload.user?.id) {
    return NextResponse.json({ ok: true })
  }
  const verdict = action?.action_id === 'l3_reject' ? 'reject' : 'approve'
  await recordApprovalDecision({
    proposalUid,
    verdict,
    reason: verdict === 'approve' ? 'slack_button' : 'slack_button_reject',
    slackUser: payload.user.id,
    slackChannel: payload.channel?.id,
    slackThreadTs: payload.message?.thread_ts ?? payload.message?.ts ?? payload.container?.thread_ts,
  })
  return NextResponse.json({ ok: true })
}
