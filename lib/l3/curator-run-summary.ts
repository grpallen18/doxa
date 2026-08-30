/**
 * Curator batch run summaries for Slack (#grok-ops or approval channel fallback).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sectionBlocks } from '@/lib/l3/slack-blocks'
import { slackConfigured } from '@/lib/l3/slack-approval'
import { fetchPropositionContexts } from '@/doxa-agents/lib/debate/proposition-context'
import { runL3Cypher } from '@/lib/l3/neo-query'
import {
  classifyProposalOutcome,
  formatCuratorRunSummaryText,
  type CuratorItemOutcome,
  type CuratorRunItemSummary,
  type CuratorRunSummary,
} from '@/lib/l3/curator-run-summary-format'

export {
  classifyProposalOutcome,
  formatCuratorRunSummaryText,
  type CuratorItemOutcome,
  type CuratorRunItemSummary,
  type CuratorRunSummary,
} from '@/lib/l3/curator-run-summary-format'

const SLACK_API = 'https://slack.com/api'

function runSummaryChannel(): string | null {
  const ops = process.env.SLACK_OPS_CHANNEL_ID?.trim()
  if (ops) return ops
  const approvals = process.env.SLACK_APPROVAL_CHANNEL_ID?.trim()
  return approvals || null
}

function clip(text: string, max = 140): string {
  const s = text.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function mintOpFromPayload(payload: Record<string, unknown>) {
  const ops = Array.isArray(payload.ops) ? payload.ops : []
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') continue
    const op = raw as Record<string, unknown>
    if (String(op.type ?? '').toUpperCase() === 'MINT_QUESTION') return op
  }
  return null
}

function propUidsFromSources(
  payload: Record<string, unknown>,
  queuePayload: Record<string, unknown>
): string[] {
  const fromProposal = Array.isArray(payload.cluster_prop_uids)
    ? payload.cluster_prop_uids.map((x) => String(x)).filter(Boolean)
    : []
  const fromQueue = Array.isArray(queuePayload.prop_uids)
    ? queuePayload.prop_uids.map((x) => String(x)).filter(Boolean)
    : []
  return [...new Set([...fromProposal, ...fromQueue])]
}

async function clusterSpeakerLabel(propUids: string[]): Promise<string | null> {
  if (!propUids.length) return null
  try {
    const rows = await fetchPropositionContexts(runL3Cypher, propUids.slice(0, 4))
    const names = [
      ...new Set(rows.map((r) => r.speaker?.trim()).filter(Boolean) as string[]),
    ]
    if (names.length >= 2) return `${names[0]} / ${names[1]}`
    if (names.length === 1) return names[0]
    if (propUids.length >= 2) return `${propUids.length}-prop cluster`
    return null
  } catch {
    return propUids.length >= 2 ? `${propUids.length}-prop cluster` : null
  }
}

export async function buildItemLabel(opts: {
  outcome: CuratorItemOutcome
  payload?: Record<string, unknown>
  queuePayload?: Record<string, unknown>
  dirtyReason?: string | null
  questionUid?: string | null
}): Promise<string> {
  const payload = opts.payload ?? {}
  const queuePayload = opts.queuePayload ?? {}

  if (opts.outcome === 'blocked') {
    return clip(String(opts.dirtyReason ?? 'blocked'), 140) || 'blocked'
  }

  const mintOp = mintOpFromPayload(payload)
  if (opts.outcome === 'mint') {
    const q = String(mintOp?.new_question_text ?? payload.new_question_text ?? '').trim()
    if (q) return clip(q, 140)
  }

  const rationale = clip(String(payload.overall_rationale ?? ''), 140)
  if (rationale) return rationale

  const propUids = propUidsFromSources(payload, queuePayload)
  const speakers = await clusterSpeakerLabel(propUids)
  if (speakers) return speakers

  if (opts.questionUid) return clip(String(opts.questionUid), 80)

  if (propUids.length) return `${propUids.length}-prop cluster`

  return opts.outcome === 'declined' ? 'declined (no rationale)' : opts.outcome
}

async function slackPostMessage(channel: string, text: string): Promise<{ ts?: string }> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN missing')
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text: 'Curator run summary',
      blocks: sectionBlocks(text),
    }),
  })
  const json = (await res.json()) as { ok?: boolean; error?: string; ts?: string }
  if (!json.ok) throw new Error(json.error ?? 'slack chat.postMessage failed')
  return { ts: json.ts }
}

async function summaryAlreadyPosted(
  supabase: SupabaseClient,
  leaseId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('l3_runs')
    .select('run_id')
    .eq('lease_id', leaseId)
    .not('result->slack_summary_ts', 'is', null)
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function buildRunSummaryFromLease(
  supabase: SupabaseClient,
  leaseId: string,
  botId: string
): Promise<CuratorRunSummary | null> {
  const { data: queueItems, error: queueErr } = await supabase
    .from('l3_review_queue')
    .select('item_id, kind, state, dirty_reason, payload, question_uid')
    .eq('lease_id', leaseId)

  if (queueErr || !queueItems?.length) return null
  if (queueItems.some((row) => row.state === 'leased')) return null

  const { data: proposals } = await supabase
    .from('l3_proposals')
    .select('proposal_uid, status, kind, payload, created_at')
    .eq('lease_id', leaseId)
    .order('created_at', { ascending: true })

  const proposalByItem = new Map<string, { status: string; payload: Record<string, unknown> }>()
  for (const row of proposals ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const itemId = payload.item_id ? String(payload.item_id) : ''
    if (itemId) proposalByItem.set(itemId, { status: String(row.status), payload })
  }

  const batchKind = String(queueItems[0]?.kind ?? 'mint')
  const items: CuratorRunItemSummary[] = []

  for (const row of queueItems) {
    const itemId = String(row.item_id)
    const queuePayload = (row.payload ?? {}) as Record<string, unknown>
    const proposal = proposalByItem.get(itemId)

    let outcome: CuratorItemOutcome
    if (row.state === 'blocked') {
      outcome = 'blocked'
    } else if (proposal) {
      outcome = classifyProposalOutcome(proposal.payload, proposal.status)
    } else if (row.state === 'leased') {
      continue
    } else {
      outcome = 'error'
    }

    const label = await buildItemLabel({
      outcome,
      payload: proposal?.payload,
      queuePayload,
      dirtyReason: row.dirty_reason,
      questionUid: row.question_uid,
    })

    items.push({ item_id: itemId, outcome, label })
  }

  return { bot_id: botId, lease_id: leaseId, batch_kind: batchKind, items }
}

export type PostCuratorRunSummaryResult = {
  ok: boolean
  posted?: boolean
  skipped?: boolean
  skipReason?: string
  threadTs?: string
}

export async function postCuratorRunSummary(
  summary: CuratorRunSummary,
  supabase?: SupabaseClient
): Promise<PostCuratorRunSummaryResult> {
  if (!slackConfigured()) {
    return { ok: false, skipped: true, skipReason: 'slack_not_configured' }
  }
  const channel = runSummaryChannel()
  if (!channel) {
    return { ok: false, skipped: true, skipReason: 'no_slack_channel' }
  }

  const body = formatCuratorRunSummaryText(summary)
  const posted = await slackPostMessage(channel, body)

  if (supabase && summary.lease_id) {
    const counts = summary.items.reduce(
      (acc, item) => {
        acc[item.outcome] = (acc[item.outcome] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    const resultPayload = {
      slack_summary_ts: posted.ts ?? null,
      outcomes: counts,
      items: summary.items,
    }

    const { data: existing } = await supabase
      .from('l3_runs')
      .select('run_id, result')
      .eq('lease_id', summary.lease_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.run_id) {
      const prior = (existing.result ?? {}) as Record<string, unknown>
      await supabase
        .from('l3_runs')
        .update({ result: { ...prior, ...resultPayload } })
        .eq('run_id', existing.run_id)
    } else {
      await supabase.from('l3_runs').insert({
        bot_id: summary.bot_id,
        kind: summary.batch_kind,
        lease_id: summary.lease_id,
        items: summary.items.length,
        ops_submitted: counts.mint ?? 0,
        result: resultPayload,
      })
    }
  }

  return { ok: true, posted: true, threadTs: posted.ts }
}

/** After each item is submitted or blocked, post one summary when the lease batch is complete. */
export async function maybePostCuratorRunSummary(
  supabase: SupabaseClient,
  leaseId: string | null | undefined,
  botId: string
): Promise<PostCuratorRunSummaryResult> {
  const lease = leaseId ? String(leaseId).trim() : ''
  if (!lease) return { ok: true, skipped: true, skipReason: 'no_lease_id' }
  if (await summaryAlreadyPosted(supabase, lease)) {
    return { ok: true, skipped: true, skipReason: 'already_posted' }
  }

  const summary = await buildRunSummaryFromLease(supabase, lease, botId)
  if (!summary) return { ok: true, skipped: true, skipReason: 'batch_incomplete' }

  return postCuratorRunSummary(summary, supabase)
}

export async function markQueueItemProposed(
  supabase: SupabaseClient,
  itemId: string | null | undefined,
  botId: string
): Promise<void> {
  const id = itemId ? String(itemId).trim() : ''
  if (!id) return
  await supabase
    .from('l3_review_queue')
    .update({ state: 'proposed', updated_at: new Date().toISOString() })
    .eq('item_id', id)
    .eq('leased_by', botId)
}
