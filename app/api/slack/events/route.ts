import { NextResponse } from 'next/server'
import { handleThreadReply, verifySlackSignature } from '@/lib/l3/slack-approval'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const raw = await request.text()
  const secret = process.env.SLACK_SIGNING_SECRET ?? ''
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? ''
  const signature = request.headers.get('x-slack-signature') ?? ''
  if (!secret || !verifySlackSignature(secret, timestamp, raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(raw || '{}') as Record<string, unknown>
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const event = payload.event as
    | { type?: string; user?: string; text?: string; channel?: string; thread_ts?: string; ts?: string; bot_id?: string; subtype?: string }
    | undefined
  if (payload.type === 'event_callback' && event?.type === 'message') {
    await handleThreadReply(event)
  }

  return NextResponse.json({ ok: true })
}
