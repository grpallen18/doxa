export type CuratorItemOutcome = 'mint' | 'declined' | 'blocked' | 'error' | 'membership'

export type CuratorRunItemSummary = {
  item_id: string
  queue_kind: string
  outcome: CuratorItemOutcome
  label: string
  op_summary?: string
}

export type CuratorRunSummary = {
  bot_id: string
  lease_ids: string[]
  items: CuratorRunItemSummary[]
}

/** Max chars stored on proposals; show the full decline rationale in ops summaries. */
export const SUMMARY_RATIONALE_MAX = 800

function clipAtSentence(text: string, max: number): string {
  const s = text.trim()
  if (s.length <= max) return s
  const slice = s.slice(0, max)
  const end = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! ')
  )
  if (end >= max * 0.45) return slice.slice(0, end + 1).trim()
  return `${slice.trim()}…`
}

/**
 * Turn curator numbered overall_rationale into readable Slack lines.
 * Keeps all numbered points (usually 3) instead of truncating at 140 chars.
 */
export function formatRationaleForSummary(
  raw: string,
  maxLen = SUMMARY_RATIONALE_MAX
): string {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text) return ''

  const numbered = text
    .split(/\s+(?=\d+\)\s)/)
    .map((p) => p.replace(/^\d+\)\s*/, '').trim())
    .filter(Boolean)

  let body: string
  if (numbered.length > 1) {
    body = numbered.map((p) => `• ${p}`).join('\n')
  } else {
    body = text.replace(/^\d+\)\s*/, '')
  }

  if (body.length <= maxLen) return body
  return clipAtSentence(body, maxLen)
}

export function classifyProposalOutcome(
  payload: Record<string, unknown>,
  status: string,
  queueKind?: string
): CuratorItemOutcome {
  const ops = Array.isArray(payload.ops) ? payload.ops : []
  const isMintQueue = queueKind === 'mint' || queueKind === 'consolidate'
  if (
    ops.some(
      (o) =>
        o &&
        typeof o === 'object' &&
        String((o as Record<string, unknown>).type ?? '').toUpperCase() === 'MINT_QUESTION'
    )
  ) {
    return 'mint'
  }
  if (status === 'pending_approval') return 'mint'
  if (ops.length === 0) return 'declined'
  if (isMintQueue) return 'declined'
  return 'membership'
}

export function summarizeMembershipOps(payload: Record<string, unknown>): string {
  const ops = Array.isArray(payload.ops) ? payload.ops : []
  const counts = new Map<string, number>()
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') continue
    const type = String((raw as Record<string, unknown>).type ?? '')
      .trim()
      .toUpperCase()
    if (!type) continue
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count}× ${type}`)
    .join(', ')
}

function countMembershipOps(items: CuratorRunItemSummary[]) {
  const counts = {
    admitted: 0,
    retyped: 0,
    other: 0,
    declined: 0,
    blocked: 0,
    error: 0,
  }
  for (const item of items) {
    if (item.outcome === 'declined') {
      counts.declined += 1
      continue
    }
    if (item.outcome === 'blocked') {
      counts.blocked += 1
      continue
    }
    if (item.outcome === 'error') {
      counts.error += 1
      continue
    }
    if (item.outcome !== 'membership') continue
    const summary = item.op_summary ?? ''
    if (summary.includes('ADMIT')) counts.admitted += 1
    if (summary.includes('RETYPE')) counts.retyped += 1
    if (!summary.includes('ADMIT') && !summary.includes('RETYPE')) counts.other += 1
  }
  return counts
}

function formatKindHeader(kind: string, items: CuratorRunItemSummary[]): string {
  if (kind === 'membership' || kind === 'consolidate') {
    const c = countMembershipOps(items)
    const parts = [
      c.admitted ? `Admitted: ${c.admitted}` : '',
      c.retyped ? `Retyped: ${c.retyped}` : '',
      c.other ? `Other ops: ${c.other}` : '',
      `Declined: ${c.declined}`,
      c.blocked ? `Blocked: ${c.blocked}` : '',
      c.error ? `Errors: ${c.error}` : '',
    ].filter(Boolean)
    return `*${kind}* — ${parts.join(' · ')}`
  }

  let minted = 0
  let declined = 0
  let blocked = 0
  let errors = 0
  for (const item of items) {
    if (item.outcome === 'mint') minted += 1
    else if (item.outcome === 'declined') declined += 1
    else if (item.outcome === 'blocked') blocked += 1
    else if (item.outcome === 'error') errors += 1
  }
  const parts = [
    `Minted: ${minted}`,
    `Declined: ${declined}`,
    blocked ? `Blocked: ${blocked}` : '',
    errors ? `Errors: ${errors}` : '',
  ].filter(Boolean)
  return `*${kind}* — ${parts.join(' · ')}`
}

function formatItemLine(index: number, item: CuratorRunItemSummary): string[] {
  const tag =
    item.outcome === 'mint'
      ? 'mint'
      : item.outcome === 'declined'
        ? 'decline'
        : item.outcome === 'blocked'
          ? 'blocked'
          : item.outcome === 'error'
            ? 'error'
            : 'membership'
  const opHint = item.op_summary ? ` (${item.op_summary})` : ''
  const label = item.label.trim()
  if (label.includes('\n')) {
    return [`${index}. *${tag}*${opHint}`, label]
  }
  return [`${index}. *${tag}*${opHint} — ${label}`]
}

export function formatCuratorRunSummaryText(summary: CuratorRunSummary): string {
  const kindOrder = ['mint', 'membership', 'consolidate']
  const present = new Set(summary.items.map((item) => item.queue_kind))
  const kinds = [
    ...kindOrder.filter((kind) => present.has(kind)),
    ...[...present].filter((kind) => !kindOrder.includes(kind)).sort(),
  ]
  const kindLabel = kinds.map((kind) => `\`${kind}\``).join(', ')

  const lines: string[] = [
    '*Curator run complete*',
    `Bot: \`${summary.bot_id}\` · ${summary.items.length} item(s) across ${kindLabel || '`unknown`'}`,
  ]

  let itemIndex = 1
  for (const kind of kinds.length ? kinds : ['unknown']) {
    const kindItems = summary.items.filter((item) => item.queue_kind === kind)
    if (!kindItems.length) continue
    lines.push('')
    lines.push(formatKindHeader(kind, kindItems))
    for (const item of kindItems) {
      lines.push(...formatItemLine(itemIndex, item))
      itemIndex += 1
    }
  }

  return lines.join('\n')
}
