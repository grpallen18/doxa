export type WorkerRunOutcome = 'submitted' | 'skipped' | 'error'

export type EditorRunItemSummary = {
  question_uid: string
  polarity: string
  question_text: string
  outcome: WorkerRunOutcome
  cluster_count?: number
  key_points?: string[]
  proposal_uid?: string
  detail?: string
}

export type EditorRunSummary = {
  worker: 'editor'
  bot_id: string
  run_id: string
  buckets_scanned: number
  items: EditorRunItemSummary[]
}

export type AuditorRunItemSummary = {
  controversy_uid: string
  question_uid: string
  question_text: string
  outcome: WorkerRunOutcome
  verdict?: 'pass' | 'block'
  reason?: string
  weakest_member_uid?: string
  proposal_uid?: string
  detail?: string
}

export type AuditorRunSummary = {
  worker: 'auditor'
  bot_id: string
  run_id: string
  pending_scanned: number
  items: AuditorRunItemSummary[]
  /** Set when the run found nothing to audit (Grok idle report or empty cron scan). */
  idle_note?: string
}

export type WorkerRunSummary = EditorRunSummary | AuditorRunSummary

export const WORKER_SUMMARY_REASON_MAX = 600

function clip(text: string, max: number): string {
  const s = text.trim().replace(/\s+/g, ' ')
  if (!s) return ''
  if (s.length <= max) return s
  const slice = s.slice(0, max)
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '))
  if (end >= max * 0.45) return slice.slice(0, end + 1).trim()
  return `${slice.trim()}…`
}

function countOutcomes(items: Array<{ outcome: WorkerRunOutcome }>) {
  let submitted = 0
  let skipped = 0
  let errors = 0
  for (const item of items) {
    if (item.outcome === 'submitted') submitted += 1
    else if (item.outcome === 'skipped') skipped += 1
    else errors += 1
  }
  return { submitted, skipped, errors }
}

export function formatEditorRunSummaryText(summary: EditorRunSummary): string {
  const { submitted, skipped, errors } = countOutcomes(summary.items)
  const lines: string[] = [
    '*Editor run complete*',
    `Bot: \`${summary.bot_id}\` · ${summary.buckets_scanned} bucket(s) scanned`,
    `Submitted: ${submitted} · Skipped: ${skipped}` + (errors ? ` · Errors: ${errors}` : ''),
    '_Viewpoint proposals auto-apply on the next `debate_pipeline` (:15). No Slack approval needed._',
  ]

  if (summary.items.length) {
    lines.push('')
    for (let i = 0; i < summary.items.length; i++) {
      const item = summary.items[i]
      if (!item) continue
      const tag =
        item.outcome === 'submitted'
          ? 'viewpoints'
          : item.outcome === 'skipped'
            ? 'skipped'
            : 'error'
      const clusterHint =
        item.cluster_count != null ? ` · ${item.cluster_count} cluster(s)` : ''
      const q = clip(item.question_text || item.question_uid, 200)
      lines.push(`${i + 1}. *${tag}* \`${item.polarity}\`${clusterHint} — ${q}`)
      if (item.key_points?.length) {
        for (const kp of item.key_points.slice(0, 3)) {
          lines.push(`   • ${clip(kp, 220)}`)
        }
      }
      if (item.detail) lines.push(`   _${clip(item.detail, 180)}_`)
    }
  }

  return lines.join('\n')
}

export function formatAuditorRunSummaryText(summary: AuditorRunSummary): string {
  const { submitted, skipped, errors } = countOutcomes(summary.items)
  let passed = 0
  let blocked = 0
  for (const item of summary.items) {
    if (item.outcome !== 'submitted') continue
    if (item.verdict === 'pass') passed += 1
    else if (item.verdict === 'block') blocked += 1
  }

  const lines: string[] = [
    '*Auditor run complete*',
    `Bot: \`${summary.bot_id}\` · ${summary.pending_scanned} controversy(ies) scanned`,
    `Submitted: ${submitted} · Pass: ${passed} · Block: ${blocked}` +
      (skipped ? ` · Skipped: ${skipped}` : '') +
      (errors ? ` · Errors: ${errors}` : ''),
  ]

  if (submitted === 0 && !errors) {
    const idle =
      summary.idle_note?.trim() ||
      'Nothing to audit — no established controversies with viewpoints on both sides.'
    lines.push(`_${idle}_`)
  } else {
    lines.push(
      '_Audit verdicts auto-apply on the next `debate_pipeline` (:15). Pass flips eligible controversies to `open` on project._'
    )
  }

  if (summary.items.length) {
    lines.push('')
    for (let i = 0; i < summary.items.length; i++) {
      const item = summary.items[i]
      if (!item) continue
      const tag =
        item.outcome === 'submitted'
          ? item.verdict === 'pass'
            ? 'pass'
            : item.verdict === 'block'
              ? 'block'
              : 'audit'
          : item.outcome === 'skipped'
            ? 'skipped'
            : 'error'
      const q = clip(item.question_text || item.question_uid, 200)
      lines.push(`${i + 1}. *${tag}* — ${q}`)
      if (item.reason) {
        lines.push(`   ${clip(item.reason, WORKER_SUMMARY_REASON_MAX)}`)
      }
      if (item.weakest_member_uid && item.outcome === 'submitted') {
        lines.push(`   Weakest: \`${item.weakest_member_uid}\``)
      }
      if (item.detail) lines.push(`   _${clip(item.detail, 180)}_`)
    }
  }

  return lines.join('\n')
}

export function formatWorkerRunSummaryText(summary: WorkerRunSummary): string {
  if (summary.worker === 'editor') return formatEditorRunSummaryText(summary)
  return formatAuditorRunSummaryText(summary)
}
