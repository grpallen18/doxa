import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postWorkerRunSummary } from '@/lib/l3/worker-run-summary'
import type {
  AuditorRunItemSummary,
  AuditorRunSummary,
  EditorRunItemSummary,
  EditorRunSummary,
  WorkerRunSummary,
} from '@/lib/l3/worker-run-summary-format'

export const runtime = 'nodejs'

function authorized(req: Request): boolean {
  const header = req.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const secrets = [process.env.SLACK_NOTIFY_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
  return Boolean(token && secrets.includes(token))
}

function parseSummary(body: Record<string, unknown>): WorkerRunSummary | null {
  const worker = body.worker === 'auditor' ? 'auditor' : body.worker === 'editor' ? 'editor' : null
  const runId = String(body.run_id ?? '').trim()
  const botId = String(body.bot_id ?? worker ?? '').trim()
  if (!worker || !runId) return null

  const items = Array.isArray(body.items) ? body.items : []

  const idleNote = String(body.idle_note ?? '').trim()

  if (worker === 'editor') {
    const summary: EditorRunSummary = {
      worker: 'editor',
      bot_id: botId || 'editor',
      run_id: runId,
      buckets_scanned: Number(body.buckets_scanned ?? items.length) || 0,
      items: items as EditorRunItemSummary[],
      ...(idleNote ? { idle_note: idleNote } : {}),
    }
    return summary
  }

  const summary: AuditorRunSummary = {
    worker: 'auditor',
    bot_id: botId || 'auditor',
    run_id: runId,
    pending_scanned: Number(body.pending_scanned ?? items.length) || 0,
    items: items as AuditorRunItemSummary[],
    ...(idleNote ? { idle_note: idleNote } : {}),
  }
  return summary
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const summary = parseSummary(body)
  if (!summary) {
    return NextResponse.json({ error: 'worker, run_id, and items required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const result = await postWorkerRunSummary(summary, supabase)

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
