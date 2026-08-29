import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import {
  buildApprovalCardBlocks,
  sectionBlocks,
  approvalActionBlock,
} from '@/lib/l3/slack-blocks'
import {
  formatMintApprovalSlackText,
  loadMintApprovalContext,
} from '@/lib/l3/mint-approval-context'

export type PostPendingApprovalResult = {
  ok: boolean
  error?: string
  threadTs?: string
  usedFallback?: boolean
  skipped?: boolean
  skipReason?: string
}

const SLACK_API = 'https://slack.com/api'

export const MIN_REJECT_REASON_LEN = 8

const PLACEHOLDER_REJECT_REASONS = new Set([
  'slack_button_reject',
  'reject',
  'no',
  'rejected',
])

export function normalizeRejectReason(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function isValidRejectReason(raw: string): boolean {
  const reason = normalizeRejectReason(raw)
  if (reason.length < MIN_REJECT_REASON_LEN) return false
  if (PLACEHOLDER_REJECT_REASONS.has(reason.toLowerCase())) return false
  return true
}

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
    const reason = normalizeRejectReason(trimmed.replace(/^(reject|no)\s*:?\s*/i, ''))
    if (!isValidRejectReason(reason)) return null
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
  contextText?: string
}): string {
  if (row.contextText) return row.contextText
  const payload = row.payload ?? {}
  const mintOp = Array.isArray(payload.ops)
    ? (payload.ops as Array<Record<string, unknown>>).find(
        (o) => String(o.type ?? '').toUpperCase() === 'MINT_QUESTION'
      )
    : null
  const q = String(
    mintOp?.new_question_text ??
      payload.new_question_text ??
      payload.question_uid ??
      row.question_uid ??
      ''
  )
  const rationale = String(payload.overall_rationale ?? payload.note ?? '').slice(0, 400)
  const url = payload.url ? String(payload.url) : ''
  const ops = Array.isArray(payload.ops) ? payload.ops.length : 0
  const lines = [`*${row.kind}*`, q && `Question: ${q}`, url && `URL: ${url}`, ops ? `Ops: ${ops}` : '', rationale]
  return lines.filter(Boolean).join('\n')
}

function mintQuestionHint(payload: Record<string, unknown>, questionUid: string | null): string {
  const mintOp = Array.isArray(payload.ops)
    ? (payload.ops as Array<Record<string, unknown>>).find(
        (o) => String(o.type ?? '').toUpperCase() === 'MINT_QUESTION'
      )
    : null
  return String(
    mintOp?.new_question_text ??
      payload.new_question_text ??
      questionUid ??
      ''
  ).trim()
}

function compactApprovalBody(
  kind: string,
  proposalUid: string,
  payload: Record<string, unknown>,
  questionUid: string | null
): string {
  const mintOp = Array.isArray(payload.ops)
    ? (payload.ops as Array<Record<string, unknown>>).find(
        (o) => String(o.type ?? '').toUpperCase() === 'MINT_QUESTION'
      )
    : null
  const lines = [
    `*${kind}* — human approval required`,
    '_Full Slack card failed to render; this is a compact fallback._',
    mintQuestionHint(payload, questionUid) && `*Question:* ${mintQuestionHint(payload, questionUid)}`,
    mintOp?.pro_answer_statement &&
      `*Pro:* ${String(mintOp.pro_answer_statement).slice(0, 400)}`,
    mintOp?.con_answer_statement &&
      `*Con:* ${String(mintOp.con_answer_statement).slice(0, 400)}`,
    `*Proposal:* \`${proposalUid}\``,
  ].filter(Boolean)
  return lines.join('\n')
}

function appBaseUrl(): string {
  return (
    process.env.DOXA_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://doxa-two.vercel.app'
  ).replace(/\/$/, '')
}

async function postApprovalFailureAlert(opts: {
  channel: string
  proposalUid: string
  kind: string
  questionHint: string
  error: string
}): Promise<void> {
  const adminUrl = `${appBaseUrl()}/admin/l3-proposals`
  const questionLine = opts.questionHint
    ? `*Question:* ${opts.questionHint.slice(0, 400)}\n`
    : ''
  await slackPost('chat.postMessage', {
    channel: opts.channel,
    text: `L3 approval card failed for ${opts.proposalUid}`,
    blocks: [
      ...sectionBlocks(
        [
          ':warning: *L3 approval card failed to post*',
          `*Proposal:* \`${opts.proposalUid}\``,
          `*Kind:* ${opts.kind}`,
          questionLine.replace(/\n$/, ''),
          `*Error:* ${opts.error}`,
          `<${adminUrl}|Open /admin/l3-proposals> (filter \`pending_approval\`)`,
          'The full card could not be rendered in Slack — use admin or retry after fix.',
        ]
          .filter(Boolean)
          .join('\n')
      ),
      approvalActionBlock(opts.proposalUid),
    ],
  })
}

async function persistSlackThread(
  proposalUid: string,
  channel: string,
  posted: { channel?: string; ts?: string }
): Promise<string | undefined> {
  const supabase = createAdminClient()
  const threadTs = posted.ts
  await supabase.from('l3_slack_threads').upsert({
    proposal_uid: proposalUid,
    slack_channel: posted.channel ?? channel,
    slack_thread_ts: threadTs,
    updated_at: new Date().toISOString(),
  })
  return threadTs
}

export async function postPendingApprovalCard(
  proposalUid: string
): Promise<PostPendingApprovalResult> {
  if (!slackConfigured()) {
    return { ok: false, skipped: true, skipReason: 'slack_not_configured' }
  }
  const channel = process.env.SLACK_APPROVAL_CHANNEL_ID!
  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('l3_proposals')
    .select('proposal_uid, kind, question_uid, payload, status')
    .eq('proposal_uid', proposalUid)
    .maybeSingle()
  if (error || !row) {
    return { ok: false, skipped: true, skipReason: error?.message ?? 'proposal_not_found' }
  }
  if (row.status !== 'pending_approval') {
    return { ok: false, skipped: true, skipReason: `status_${row.status}` }
  }

  const payload = (row.payload ?? {}) as Record<string, unknown>
  const kind = String(row.kind)
  const questionHint = mintQuestionHint(payload, row.question_uid)

  let contextText: string | undefined
  if (
    kind === 'mint' ||
    (Array.isArray(payload.ops) &&
      payload.ops.some(
        (o) =>
          o &&
          typeof o === 'object' &&
          String((o as Record<string, unknown>).type ?? '').toUpperCase() === 'MINT_QUESTION'
      ))
  ) {
    const ctx = await loadMintApprovalContext(payload)
    contextText = formatMintApprovalSlackText({ kind, payload, context: ctx })
  }

  const bodyText = proposalSummary({
    kind,
    question_uid: row.question_uid,
    payload,
    contextText,
  })

  try {
    const posted = await slackPost('chat.postMessage', {
      channel,
      text: `L3 approval needed: ${row.kind}`,
      blocks: buildApprovalCardBlocks(proposalUid, bodyText),
    })
    const threadTs = await persistSlackThread(proposalUid, channel, posted)
    return { ok: true, threadTs }
  } catch (primaryErr) {
    const primaryMessage =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr)

    try {
      const compactBody = compactApprovalBody(kind, proposalUid, payload, row.question_uid)
      const posted = await slackPost('chat.postMessage', {
        channel,
        text: `L3 approval needed: ${row.kind}`,
        blocks: buildApprovalCardBlocks(proposalUid, compactBody),
      })
      const threadTs = await persistSlackThread(proposalUid, channel, posted)
      return { ok: true, threadTs, usedFallback: true, error: primaryMessage }
    } catch (compactErr) {
      const compactMessage =
        compactErr instanceof Error ? compactErr.message : String(compactErr)
      try {
        await postApprovalFailureAlert({
          channel,
          proposalUid,
          kind,
          questionHint,
          error: `${primaryMessage}; compact card also failed: ${compactMessage}`,
        })
      } catch {
        /* last resort — nothing more we can do in Slack */
      }
      return {
        ok: false,
        error: `${primaryMessage}; compact card also failed: ${compactMessage}`,
      }
    }
  }
}

export async function openRejectReasonModal(opts: {
  triggerId: string
  proposalUid: string
  slackChannel?: string
  slackThreadTs?: string
}): Promise<void> {
  await slackPost('views.open', {
    trigger_id: opts.triggerId,
    view: {
      type: 'modal',
      callback_id: 'l3_reject_modal',
      private_metadata: JSON.stringify({
        proposal_uid: opts.proposalUid,
        slack_channel: opts.slackChannel ?? '',
        slack_thread_ts: opts.slackThreadTs ?? '',
      }),
      title: { type: 'plain_text', text: 'Reject proposal' },
      submit: { type: 'plain_text', text: 'Reject' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'reject_reason_block',
          label: { type: 'plain_text', text: 'Reason (required)' },
          element: {
            type: 'plain_text_input',
            action_id: 'reject_reason',
            multiline: true,
            min_length: MIN_REJECT_REASON_LEN,
            max_length: 2000,
            placeholder: {
              type: 'plain_text',
              text: 'Explain why this proposal should not be applied (grain, missing context, wrong question, etc.).',
            },
          },
        },
      ],
    },
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

  const rejectReason =
    opts.verdict === 'reject' ? normalizeRejectReason(opts.reason) : opts.reason
  if (opts.verdict === 'reject' && !isValidRejectReason(rejectReason)) {
    return {
      ok: false,
      error: `reject reason required (at least ${MIN_REJECT_REASON_LEN} characters, not a placeholder)`,
    }
  }

  await supabase.from('l3_approval_decisions').insert({
    proposal_uid: opts.proposalUid,
    slack_channel: opts.slackChannel ?? null,
    slack_thread_ts: opts.slackThreadTs ?? null,
    approver_slack_user: opts.slackUser,
    verdict: opts.verdict,
    reason: rejectReason,
    payload_snapshot: row.payload,
  })

  if (opts.verdict === 'reject') {
    await supabase
      .from('l3_proposals')
      .update({
        status: 'rejected',
        validator_errors: { slack: rejectReason },
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
      reason: rejectReason,
      proposal_uid: opts.proposalUid,
    })
    if (opts.slackChannel && opts.slackThreadTs) {
      await slackPost('chat.postMessage', {
        channel: opts.slackChannel,
        thread_ts: opts.slackThreadTs,
        text: `Rejected: ${rejectReason}`,
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
