/**
 * Editor / auditor run summaries for Slack (#grok-ops or approval channel fallback).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sectionBlocks } from '@/lib/l3/slack-blocks'
import { slackConfigured } from '@/lib/l3/slack-approval'
import {
  formatWorkerRunSummaryText,
  type WorkerRunSummary,
} from '@/lib/l3/worker-run-summary-format'

export {
  formatEditorRunSummaryText,
  formatAuditorRunSummaryText,
  formatWorkerRunSummaryText,
  WORKER_SUMMARY_REASON_MAX,
  type AuditorRunItemSummary,
  type AuditorRunSummary,
  type EditorRunItemSummary,
  type EditorRunSummary,
  type WorkerRunOutcome,
  type WorkerRunSummary,
} from '@/lib/l3/worker-run-summary-format'

const SLACK_API = 'https://slack.com/api'

function runSummaryChannel(): string | null {
  const ops = process.env.SLACK_OPS_CHANNEL_ID?.trim()
  if (ops) return ops
  const approvals = process.env.SLACK_APPROVAL_CHANNEL_ID?.trim()
  return approvals || null
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
      text: 'L3 worker run summary',
      blocks: sectionBlocks(text),
    }),
  })
  const json = (await res.json()) as { ok?: boolean; error?: string; ts?: string }
  if (!json.ok) throw new Error(json.error ?? 'slack chat.postMessage failed')
  return { ts: json.ts }
}

export type PostWorkerRunSummaryResult = {
  ok: boolean
  posted?: boolean
  skipped?: boolean
  skipReason?: string
  threadTs?: string
}

function shouldPostSummary(summary: WorkerRunSummary): boolean {
  const hasSubmitted = summary.items.some((item) => item.outcome === 'submitted')
  const hasErrors = summary.items.some((item) => item.outcome === 'error')
  const idleNote =
    summary.worker === 'auditor'
      ? summary.idle_note
      : summary.worker === 'editor'
        ? summary.idle_note
        : undefined
  if (idleNote?.trim()) return true
  return hasSubmitted || hasErrors || summary.items.length === 0
}

export async function postWorkerRunSummary(
  summary: WorkerRunSummary,
  supabase?: SupabaseClient
): Promise<PostWorkerRunSummaryResult> {
  if (!shouldPostSummary(summary)) {
    return { ok: true, skipped: true, skipReason: 'nothing_to_report' }
  }
  if (!slackConfigured()) {
    return { ok: false, skipped: true, skipReason: 'slack_not_configured' }
  }
  const channel = runSummaryChannel()
  if (!channel) {
    return { ok: false, skipped: true, skipReason: 'no_slack_channel' }
  }

  if (supabase && summary.run_id) {
    const { data: existing } = await supabase
      .from('l3_runs')
      .select('result')
      .eq('run_id', summary.run_id)
      .maybeSingle()
    const prior = (existing?.result ?? {}) as Record<string, unknown>
    if (prior.slack_summary_ts) {
      return { ok: true, skipped: true, skipReason: 'already_posted' }
    }
  }

  const body = formatWorkerRunSummaryText(summary)
  const posted = await slackPostMessage(channel, body)

  if (supabase && summary.run_id) {
    const { data: existing } = await supabase
      .from('l3_runs')
      .select('result')
      .eq('run_id', summary.run_id)
      .maybeSingle()
    const prior = (existing?.result ?? {}) as Record<string, unknown>
    await supabase
      .from('l3_runs')
      .update({
        result: {
          ...prior,
          slack_summary_ts: posted.ts ?? null,
          summary_items: summary.items,
        },
      })
      .eq('run_id', summary.run_id)
  }

  return { ok: true, posted: true, threadTs: posted.ts }
}
