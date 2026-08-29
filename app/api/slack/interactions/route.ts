import { NextResponse } from 'next/server'
import {
  isValidRejectReason,
  MIN_REJECT_REASON_LEN,
  normalizeRejectReason,
  openRejectReasonModal,
  recordApprovalDecision,
  verifySlackSignature,
} from '@/lib/l3/slack-approval'

export const runtime = 'nodejs'

type SlackInteractionPayload = {
  type?: string
  trigger_id?: string
  user?: { id?: string }
  channel?: { id?: string }
  message?: { ts?: string; thread_ts?: string }
  actions?: Array<{ action_id?: string; value?: string }>
  container?: { thread_ts?: string; message_ts?: string }
  view?: {
    callback_id?: string
    private_metadata?: string
    state?: {
      values?: Record<
        string,
        Record<string, { value?: string }>
      >
    }
  }
}

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
  const payload = JSON.parse(payloadRaw) as SlackInteractionPayload

  if (payload.type === 'view_submission' && payload.view?.callback_id === 'l3_reject_modal') {
    const reason = normalizeRejectReason(
      payload.view.state?.values?.reject_reason_block?.reject_reason?.value ?? ''
    )
    if (!isValidRejectReason(reason)) {
      return NextResponse.json({
        response_action: 'errors',
        errors: {
          reject_reason_block: `Enter at least ${MIN_REJECT_REASON_LEN} characters explaining the rejection.`,
        },
      })
    }

    let meta: {
      proposal_uid?: string
      slack_channel?: string
      slack_thread_ts?: string
    } = {}
    try {
      meta = JSON.parse(payload.view.private_metadata ?? '{}') as typeof meta
    } catch {
      return NextResponse.json({ ok: true })
    }

    const proposalUid = meta.proposal_uid ?? ''
    const userId = payload.user?.id ?? ''
    if (!proposalUid || !userId) {
      return NextResponse.json({ ok: true })
    }

    await recordApprovalDecision({
      proposalUid,
      verdict: 'reject',
      reason,
      slackUser: userId,
      slackChannel: meta.slack_channel || undefined,
      slackThreadTs: meta.slack_thread_ts || undefined,
    })

    return NextResponse.json({ response_action: 'clear' })
  }

  if (payload.type !== 'block_actions') {
    return NextResponse.json({ ok: true })
  }

  const action = payload.actions?.[0]
  const proposalUid = action?.value ?? ''
  if (!proposalUid || !payload.user?.id) {
    return NextResponse.json({ ok: true })
  }

  const threadTs =
    payload.message?.thread_ts ?? payload.message?.ts ?? payload.container?.thread_ts
  const channelId = payload.channel?.id

  if (action?.action_id === 'l3_reject') {
    const triggerId = payload.trigger_id
    if (!triggerId) {
      return NextResponse.json({ ok: true })
    }
    try {
      await openRejectReasonModal({
        triggerId,
        proposalUid,
        slackChannel: channelId,
        slackThreadTs: threadTs,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({
        response_type: 'ephemeral',
        text: `Could not open reject form: ${message}`,
      })
    }
    return NextResponse.json({ ok: true })
  }

  if (action?.action_id === 'l3_approve') {
    await recordApprovalDecision({
      proposalUid,
      verdict: 'approve',
      reason: 'slack_button',
      slackUser: payload.user.id,
      slackChannel: channelId,
      slackThreadTs: threadTs,
    })
  }

  return NextResponse.json({ ok: true })
}
