'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Separator } from '@/components/ui/separator'
import { controversyDisplayName } from '@/lib/admin/controversy-display'
import { cn } from '@/lib/utils'

type ControversyRow = {
  uid: string
  title: string | null
  question: string | null
  summary: string | null
  sides_count: number
  source_count: number
  topic_key: string | null
  status: string
  publish_block_reason: string | null
  updated_at: string
}

type StatusFilter = 'all' | 'open' | 'developing' | 'closed'

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'developing', label: 'Developing' },
  { id: 'closed', label: 'Closed' },
]

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'developing':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
    case 'closed':
      return 'bg-muted/60 text-muted'
    default:
      return 'bg-muted/40 text-muted'
  }
}

export default function AdminGraphControversiesPage() {
  const [items, setItems] = useState<ControversyRow[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)

  const loadControversies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/graph-controversies?status=${encodeURIComponent(statusFilter)}`
      )
      const json = await res.json()
      setItems(res.ok && json?.data?.items ? json.data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadControversies()
  }, [loadControversies])

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graph controversies</h1>
        <p className="mt-1 text-sm text-muted">
          Neo4j Phase 2 projections. Only <code className="text-xs">open</code> rows appear on Explore.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              'rounded-bevel border px-3 py-1.5 text-xs font-medium',
              statusFilter === tab.id
                ? 'border-border bg-surface-section text-foreground'
                : 'border-transparent bg-surface text-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Panel>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">
            No controversies for this filter. Run{' '}
            <code className="text-xs">debate_pipeline</code> after Arguments exist.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.uid} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/graph-controversies/${encodeURIComponent(c.uid)}`}
                    className="font-medium hover:underline"
                  >
                    {controversyDisplayName(c)}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-bevel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        statusBadgeClass(c.status)
                      )}
                    >
                      {c.status}
                    </span>
                    {c.publish_block_reason && (
                      <span className="text-xs text-muted">{c.publish_block_reason}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {c.sides_count} sides · {c.source_count} sources
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">L3 review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Membership is curator-gated. Open the proposal queue for per-op review, density
            metrics, and gold negatives.
          </p>
        </div>
        <Panel>
          <Link href="/admin/l3-proposals" className="text-sm text-accent-primary hover:underline">
            Open L3 proposals
          </Link>
        </Panel>
      </div>

      <Separator />

      <p className="text-xs text-muted-foreground">
        Developing controversies stay out of Explore until projection promotes them to open.
      </p>
    </div>
  )
}
