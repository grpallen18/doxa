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
  formatRationaleForSummary,
  summarizeMembershipOps,
  SUMMARY_RATIONALE_MAX,
  type CuratorItemOutcome,
  type CuratorRunItemSummary,
  type CuratorRunSummary,
} from '@/lib/l3/curator-run-summary-format'

export {
  classifyProposalOutcome,
  formatCuratorRunSummaryText,
  formatRationaleForSummary,
  SUMMARY_RATIONALE_MAX,
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

function clip(text: string, max: number): string {
  const s = text.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (s.length <= max) return s
  return clipAtSentence(s, max)
}

function clipAtSentence(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const end = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! ')
  )
  if (end >= max * 0.45) return slice.slice(0, end + 1).trim()
  return `${slice.trim()}…`
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
  queueKind?: string
  payload?: Record<string, unknown>
  queuePayload?: Record<string, unknown>
  dirtyReason?: string | null
  questionUid?: string | null
}): Promise<string> {
  const payload = opts.payload ?? {}
  const queuePayload = opts.queuePayload ?? {}

  if (opts.outcome === 'blocked') {
    return clip(String(opts.dirtyReason ?? 'blocked'), 400) || 'blocked'
  }

  const mintOp = mintOpFromPayload(payload)
  if (opts.outcome === 'mint') {
    const q = String(mintOp?.new_question_text ?? payload.new_question_text ?? '').trim()
    if (q) return q
  }

  const rationale = formatRationaleForSummary(String(payload.overall_rationale ?? ''))
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

async function botHasActiveLeases(supabase: SupabaseClient, botId: string): Promise<boolean> {
  const { data } = await supabase
    .from('l3_review_queue')
    .select('item_id')
    .eq('leased_by', botId)
    .eq('state', 'leased')
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function getCompletedLeaseIds(supabase: SupabaseClient, botId: string): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from('l3_review_queue')
    .select('lease_id, state')
    .eq('leased_by', botId)
    .not('lease_id', 'is', null)

  if (error || !rows?.length) return []

  const statesByLease = new Map<string, string[]>()
  for (const row of rows) {
    const leaseId = String(row.lease_id)
    const states = statesByLease.get(leaseId) ?? []
    states.push(String(row.state))
    statesByLease.set(leaseId, states)
  }

  return [...statesByLease.entries()]
    .filter(([, states]) => states.every((state) => state !== 'leased'))
    .map(([leaseId]) => leaseId)
}

async function getRecentCompletedLeaseIds(
  supabase: SupabaseClient,
  botId: string,
  maxAgeMinutes = 45
): Promise<string[]> {
  const completed = await getCompletedLeaseIds(supabase, botId)
  if (!completed.length) return []

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString()
  const { data: rows } = await supabase
    .from('l3_review_queue')
    .select('lease_id, updated_at')
    .in('lease_id', completed)
    .eq('leased_by', botId)

  const latestByLease = new Map<string, string>()
  for (const row of rows ?? []) {
    const leaseId = String(row.lease_id)
    const updatedAt = String(row.updated_at ?? '')
    const current = latestByLease.get(leaseId)
    if (!current || updatedAt > current) latestByLease.set(leaseId, updatedAt)
  }

  return completed.filter((leaseId) => (latestByLease.get(leaseId) ?? '') >= cutoff)
}

async function clearLeaseOwnership(
  supabase: SupabaseClient,
  leaseIds: string[]
): Promise<void> {
  if (!leaseIds.length) return
  await supabase
    .from('l3_review_queue')
    .update({ leased_by: null, updated_at: new Date().toISOString() })
    .in('lease_id', leaseIds)
}

async function leasesAlreadySummarized(
  supabase: SupabaseClient,
  leaseIds: string[]
): Promise<boolean> {
  if (!leaseIds.length) return true

  const { data } = await supabase
    .from('l3_runs')
    .select('lease_id, result')
    .in('lease_id', leaseIds)

  const summarized = new Set<string>()
  for (const row of data ?? []) {
    const result = (row.result ?? {}) as Record<string, unknown>
    if (!result.slack_summary_ts) continue
    if (row.lease_id) summarized.add(String(row.lease_id))
    const bundled = Array.isArray(result.summarized_lease_ids)
      ? result.summarized_lease_ids.map((id) => String(id))
      : []
    for (const leaseId of bundled) summarized.add(leaseId)
  }

  return leaseIds.every((leaseId) => summarized.has(leaseId))
}

async function summaryAlreadyPosted(
  supabase: SupabaseClient,
  leaseIds: string[]
): Promise<boolean> {
  return leasesAlreadySummarized(supabase, leaseIds)
}

export async function buildRunSummaryFromLeases(
  supabase: SupabaseClient,
  leaseIds: string[],
  botId: string
): Promise<CuratorRunSummary | null> {
  const leases = [...new Set(leaseIds.map((id) => String(id).trim()).filter(Boolean))]
  if (!leases.length) return null

  const { data: queueItems, error: queueErr } = await supabase
    .from('l3_review_queue')
    .select('item_id, kind, state, dirty_reason, payload, question_uid, lease_id')
    .in('lease_id', leases)
    .order('kind', { ascending: true })

  if (queueErr || !queueItems?.length) return null
  if (queueItems.some((row) => row.state === 'leased')) return null

  const { data: proposals } = await supabase
    .from('l3_proposals')
    .select('proposal_uid, status, kind, payload, created_at, lease_id')
    .in('lease_id', leases)
    .order('created_at', { ascending: true })

  const proposalByItem = new Map<string, { status: string; payload: Record<string, unknown> }>()
  for (const row of proposals ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const itemId = payload.item_id ? String(payload.item_id) : ''
    if (itemId) proposalByItem.set(itemId, { status: String(row.status), payload })
  }

  const items: CuratorRunItemSummary[] = []

  for (const row of queueItems) {
    const itemId = String(row.item_id)
    const queueKind = String(row.kind ?? 'unknown')
    const queuePayload = (row.payload ?? {}) as Record<string, unknown>
    const proposal = proposalByItem.get(itemId)

    let outcome: CuratorItemOutcome
    if (row.state === 'blocked') {
      outcome = 'blocked'
    } else if (proposal) {
      outcome = classifyProposalOutcome(proposal.payload, proposal.status, queueKind)
    } else if (row.state === 'leased') {
      continue
    } else {
      outcome = 'error'
    }

    const label = await buildItemLabel({
      outcome,
      queueKind,
      payload: proposal?.payload,
      queuePayload,
      dirtyReason: row.dirty_reason,
      questionUid: row.question_uid,
    })

    const opSummary =
      outcome === 'membership' && proposal?.payload
        ? summarizeMembershipOps(proposal.payload)
        : undefined

    items.push({
      item_id: itemId,
      queue_kind: queueKind,
      outcome,
      label,
      op_summary: opSummary || undefined,
    })
  }

  return { bot_id: botId, lease_ids: leases, items }
}

/** @deprecated Use buildRunSummaryFromLeases */
export async function buildRunSummaryFromLease(
  supabase: SupabaseClient,
  leaseId: string,
  botId: string
): Promise<CuratorRunSummary | null> {
  return buildRunSummaryFromLeases(supabase, [leaseId], botId)
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

  if (supabase && summary.lease_ids.length) {
    const counts = summary.items.reduce(
      (acc, item) => {
        acc[item.outcome] = (acc[item.outcome] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    const resultPayload = {
      slack_summary_ts: posted.ts ?? null,
      summarized_lease_ids: summary.lease_ids,
      outcomes: counts,
      items: summary.items,
    }

    for (const leaseId of summary.lease_ids) {
      const { data: existing } = await supabase
        .from('l3_runs')
        .select('run_id, result')
        .eq('lease_id', leaseId)
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
          kind: [...new Set(summary.items.map((item) => item.queue_kind))].join(','),
          lease_id: leaseId,
          items: summary.items.length,
          ops_submitted: counts.mint ?? 0,
          result: resultPayload,
        })
      }
    }
  }

  return { ok: true, posted: true, threadTs: posted.ts }
}

/** After each item is submitted or blocked, post one summary when the bot's full run is complete. */
export async function maybePostCuratorRunSummary(
  supabase: SupabaseClient,
  leaseId: string | null | undefined,
  botId: string
): Promise<PostCuratorRunSummaryResult> {
  const lease = leaseId ? String(leaseId).trim() : ''
  if (!lease) return { ok: true, skipped: true, skipReason: 'no_lease_id' }

  if (await botHasActiveLeases(supabase, botId)) {
    return { ok: true, skipped: true, skipReason: 'bot_has_active_leases' }
  }

  const completedLeaseIds = await getRecentCompletedLeaseIds(supabase, botId)
  if (!completedLeaseIds.length) {
    return { ok: true, skipped: true, skipReason: 'batch_incomplete' }
  }

  if (await summaryAlreadyPosted(supabase, completedLeaseIds)) {
    return { ok: true, skipped: true, skipReason: 'already_posted' }
  }

  const summary = await buildRunSummaryFromLeases(supabase, completedLeaseIds, botId)
  if (!summary) return { ok: true, skipped: true, skipReason: 'batch_incomplete' }

  const result = await postCuratorRunSummary(summary, supabase)
  if (result.posted) {
    await clearLeaseOwnership(supabase, completedLeaseIds)
  }
  return result
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
