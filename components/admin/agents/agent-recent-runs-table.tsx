'use client'

import Link from 'next/link'
import type { AgentRunSummary } from '@/lib/admin/agent-detail'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { EMBED_PAGE_SIZE, VIEW_ALL_PAGE_SIZE } from '@/lib/admin/pagination'
import { PaginatedListFooter } from '@/components/admin/record/paginated-list-footer'
import { usePaginatedList } from '@/components/admin/record/use-paginated-list'
import { StatusBadge } from '@/components/admin/record/status-badge'
import { cn } from '@/lib/utils'

const RUNS_GRID =
  'grid grid-cols-[minmax(5.5rem,7rem)_minmax(0,1fr)_minmax(0,1.25fr)] gap-x-4'

function runStatusVariant(status: string): 'success' | 'danger' | 'warning' | 'muted' | 'default' {
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'success' || normalized === 'no_op') {
    return 'success'
  }
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'error') {
    return 'danger'
  }
  if (normalized === 'running' || normalized === 'looping' || normalized === 'in_progress') {
    return 'warning'
  }
  if (normalized === 'skipped') return 'muted'
  return 'default'
}

export function AgentRecentRunsTable({
  stepId,
  viewAll = false,
}: {
  stepId: string
  viewAll?: boolean
}) {
  const pageSize = viewAll ? VIEW_ALL_PAGE_SIZE : EMBED_PAGE_SIZE
  const { items, pagination, loading, error, page, setPage, totalPages } =
    usePaginatedList<AgentRunSummary>({
      apiPath: `/api/admin/agents/${stepId}/runs`,
      pageSize,
      itemsKey: 'runs',
      viewAll,
    })

  if (loading) return <p className="text-xs text-muted">Loading recent runs…</p>
  if (error) return <p className="text-xs text-destructive">{error}</p>

  return (
    <>
      <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
        <div
          className={cn(
            RUNS_GRID,
            'border-b border-[var(--record-section-header-border)] bg-[var(--record-section-header-bg)] px-3 py-2 text-xs font-medium text-[var(--record-section-header-fg)]'
          )}
        >
          <span>Status</span>
          <span>Started</span>
          <span>Details</span>
        </div>
        <ol className="divide-y divide-subtle">
          {items.length === 0 ? (
            <li className={cn(RUNS_GRID, 'px-3 py-3 text-xs text-muted')}>
              <span className="col-span-full">No runs recorded for this agent.</span>
            </li>
          ) : null}
          {items.map((run) => (
            <li key={run.run_id} className={cn(RUNS_GRID, 'items-start px-3 py-2')}>
              <StatusBadge label={run.status} variant={runStatusVariant(run.status)} />
              <time
                className="text-xs tabular-nums text-muted"
                dateTime={run.started_at}
                title={run.started_at}
              >
                {formatAdminDateTime(run.started_at)}
              </time>
              <div className="min-w-0 space-y-1 text-xs">
                {run.model_name ? (
                  <p
                    className="text-muted"
                    title={
                      run.model_names.length > 1
                        ? run.model_names.join(', ')
                        : undefined
                    }
                  >
                    Model: {run.model_name}
                  </p>
                ) : null}
                {run.error && <p className="text-destructive">{run.error}</p>}
                {run.story_id && (
                  <Link
                    href={`/admin/stories/${run.story_id}`}
                    className="text-accent-primary hover:underline"
                  >
                    Related story
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <PaginatedListFooter
        pagination={pagination}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        viewAllHref={viewAll ? undefined : `/admin/agents/${stepId}/runs`}
      />
    </>
  )
}
