import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'

const SLACK_API = 'https://slack.com/api'

export function slackConfigured(): boolean {
  return Boolean(
    process.env.SLACK_BOT_TOKEN &&
      process.env.SLACK_SIGNING_SECRET &&
      process.env.SLACK_APPROVAL_CHANNEL_ID
  )
}

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 60 * 5) return false
  const base = `v0:${timestamp}:${rawBody}`
  const digest = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`
  const a = Buffer.from(digest)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function parseApprovalText(
  text: string
): { verdict: 'approve' | 'reject'; reason: string } | null {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()
  if (
    lower === 'approve' ||
    lower === 'yes' ||
    lower === 'lgtm' ||
    /^approve\b/.test(lower)
  ) {
    return { verdict: 'approve', reason: trimmed }
  }
  if (/^reject\b/.test(lower) || lower === 'no') {
    const reason = trimmed.replace(/^(reject|no)\s*:?\s*/i, '').trim() || trimmed
    return { verdict: 'reject', reason }
  }
  return null
}

function approverAllowed(userId: string): boolean {
  if (userId.startsWith('bot:')) return true
  const raw = (process.env.SLACK_APPROVER_USER_IDS ?? '').trim()
  if (!raw) return true
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(userId)
}

async function slackPost(method: string, body: Record<string, unknown>) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN missing')
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { ok?: boolean; error?: string; ts?: string; channel?: string }
  if (!json.ok) throw new Error(json.error ?? `slack ${method} failed`)
  return json
}

function proposalSummary(row: {
  kind: string
  question_uid: string | null
  payload: Record<string, unknown>
}): string {
  const payload = row.payload ?? {}
  const q = String(payload.question_uid ?? row.question_uid ?? payload.new_question_text ?? '')
  const rationale = String(payload.overall_rationale ?? payload.note ?? '').slice(0, 400)
  const url = payload.url ? String(payload.url) : ''
  const ops = Array.isArray(payload.ops) ? payload.ops.length : 0
  const lines = [`*${row.kind}*`, q && `Question: ${q}`, url && `URL: ${url}`, ops ? `Ops: ${ops}` : '', rationale]
  return lines.filter(Boolean).join('\n')
}

export async function postPendingApprovalCard(proposalUid: string): Promise<void> {
  if (!slackConfigured()) return
  const channel = process.env.SLACK_APPROVAL_CHANNEL_ID!
  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('l3_proposals')
    .select('proposal_uid, kind, question_uid, payload, status')
    .eq('proposal_uid', proposalUid)
    .maybeSingle()
  if (error || !row) return
  if (row.status !== 'pending_approval') return

  const text = proposalSummary({
    kind: String(row.kind),
    question_uid: row.question_uid,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  })

  const posted = await slackPost('chat.postMessage', {
    channel,
    text: `L3 approval needed: ${row.kind}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${text}\n\nReply \`approve\` or \`reject: reason\` in this thread.` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Approve' },
            style: 'primary',
            action_id: 'l3_approve',
            value: proposalUid,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Reject' },
            style: 'danger',
            action_id: 'l3_reject',
            value: proposalUid,
          },
        ],
      },
    ],
  })

  await supabase.from('l3_slack_threads').upsert({
    proposal_uid: proposalUid,
    slack_channel: posted.channel ?? channel,
    slack_thread_ts: posted.ts,
    updated_at: new Date().toISOString(),
  })
}

async function invokeApply(proposalUid: string): Promise<unknown> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceKey) throw new Error('apply not configured')
  const res = await fetch(`${supabaseUrl}/functions/v1/apply_l3_proposals`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ proposal_uid: proposalUid, force_apply_all: true }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json
}

export async function recordApprovalDecision(opts: {
  proposalUid: string
  verdict: 'approve' | 'reject'
  reason: string
  slackUser: string
  slackChannel?: string
  slackThreadTs?: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!approverAllowed(opts.slackUser)) {
    return { ok: false, error: 'approver not allowlisted' }
  }
  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('l3_proposals')
    .select('proposal_uid, payload, status, question_uid')
    .eq('proposal_uid', opts.proposalUid)
    .maybeSingle()
  if (!row) return { ok: false, error: 'proposal not found' }
  if (row.status !== 'pending_approval' && row.status !== 'submitted') {
    return { ok: false, error: `proposal already ${row.status}` }
  }

  await supabase.from('l3_approval_decisions').insert({
    proposal_uid: opts.proposalUid,
    slack_channel: opts.slackChannel ?? null,
    slack_thread_ts: opts.slackThreadTs ?? null,
    approver_slack_user: opts.slackUser,
    verdict: opts.verdict,
    reason: opts.reason,
    payload_snapshot: row.payload,
  })

  if (opts.verdict === 'reject') {
    await supabase
      .from('l3_proposals')
      .update({
        status: 'rejected',
        validator_errors: { slack: opts.reason },
        updated_at: new Date().toISOString(),
      })
      .eq('proposal_uid', opts.proposalUid)
    const payload = (row.payload ?? {}) as { lead_request_id?: string }
    if (payload.lead_request_id) {
      await supabase
        .from('lead_requests')
        .update({
          state: 'pending',
          claimed_by_bot: null,
          claimed_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('request_id', payload.lead_request_id)
        .eq('state', 'claimed')
    }
    await supabase.from('l3_gold_negatives').insert({
      question_uid: row.question_uid ?? '',
      prop_uid: null,
      op_type: 'MINT_QUESTION',
      reason: opts.reason,
      proposal_uid: opts.proposalUid,
    })
    if (opts.slackChannel && opts.slackThreadTs) {
      await slackPost('chat.postMessage', {
        channel: opts.slackChannel,
        thread_ts: opts.slackThreadTs,
        text: `Rejected: ${opts.reason}`,
      }).catch(() => {})
    }
    return { ok: true }
  }

  await supabase
    .from('l3_proposals')
    .update({ status: 'validated', updated_at: new Date().toISOString() })
    .eq('proposal_uid', opts.proposalUid)

  try {
    await invokeApply(opts.proposalUid)
    if (opts.slackChannel && opts.slackThreadTs) {
      await slackPost('chat.postMessage', {
        channel: opts.slackChannel,
        thread_ts: opts.slackThreadTs,
        text: `Approved and applied.`,
      }).catch(() => {})
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (opts.slackChannel && opts.slackThreadTs) {
      await slackPost('chat.postMessage', {
        channel: opts.slackChannel,
        thread_ts: opts.slackThreadTs,
        text: `Approved but apply failed: ${message}`,
      }).catch(() => {})
    }
    return { ok: false, error: message }
  }
}

export async function handleThreadReply(event: {
  user?: string
  text?: string
  channel?: string
  thread_ts?: string
  ts?: string
  bot_id?: string
  subtype?: string
}): Promise<void> {
  if (event.bot_id || event.subtype) return
  if (!event.thread_ts || event.thread_ts === event.ts) return
  if (!event.user || !event.text || !event.channel) return
  if (event.channel !== process.env.SLACK_APPROVAL_CHANNEL_ID) return

  const supabase = createAdminClient()
  const { data: thread } = await supabase
    .from('l3_slack_threads')
    .select('proposal_uid')
    .eq('slack_thread_ts', event.thread_ts)
    .maybeSingle()
  if (!thread?.proposal_uid) return

  const parsed = parseApprovalText(event.text)
  if (!parsed) return
  await recordApprovalDecision({
    proposalUid: thread.proposal_uid,
    verdict: parsed.verdict,
    reason: parsed.reason,
    slackUser: event.user,
    slackChannel: event.channel,
    slackThreadTs: event.thread_ts,
  })
}
