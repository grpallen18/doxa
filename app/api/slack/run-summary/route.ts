import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { maybePostCuratorRunSummary } from '@/lib/l3/curator-run-summary'

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
  const leaseId = String(body.lease_id ?? '')
  const botId = String(body.bot_id ?? 'curator')
  if (!leaseId) return NextResponse.json({ error: 'lease_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const result = await maybePostCuratorRunSummary(supabase, leaseId, botId)

  if (result.skipped) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      posted: false,
      reason: result.skipReason,
    })
  }
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.skipReason ?? 'slack_post_failed' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, posted: true, thread_ts: result.threadTs })
}
