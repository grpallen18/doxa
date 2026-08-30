export type CuratorItemOutcome = 'mint' | 'declined' | 'blocked' | 'error' | 'membership'

export type CuratorRunItemSummary = {
  item_id: string
  outcome: CuratorItemOutcome
  label: string
}

export type CuratorRunSummary = {
  bot_id: string
  lease_id: string
  batch_kind: string
  items: CuratorRunItemSummary[]
}

export function classifyProposalOutcome(
  payload: Record<string, unknown>,
  status: string
): CuratorItemOutcome {
  const ops = Array.isArray(payload.ops) ? payload.ops : []
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
  return 'membership'
}

export function formatCuratorRunSummaryText(summary: CuratorRunSummary): string {
  const counts = {
    mint: 0,
    declined: 0,
    blocked: 0,
    error: 0,
    membership: 0,
  }
  for (const item of summary.items) counts[item.outcome] += 1

  const lines: string[] = [
    '*Curator run complete*',
    `Bot: \`${summary.bot_id}\` · batch: \`${summary.batch_kind}\` · ${summary.items.length} item(s)`,
    `Minted: ${counts.mint} · Declined: ${counts.declined} · Blocked: ${counts.blocked}` +
      (counts.membership ? ` · Membership ops: ${counts.membership}` : '') +
      (counts.error ? ` · Errors: ${counts.error}` : ''),
  ]

  if (summary.items.length) {
    lines.push('')
    for (let i = 0; i < summary.items.length; i++) {
      const item = summary.items[i]
      if (!item) continue
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
      lines.push(`${i + 1}. *${tag}* — ${item.label}`)
    }
  }

  return lines.join('\n')
}
