'use client'

import type { AgentPromptAuditEvent } from '@/lib/admin/agent-prompt-store'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { EMBED_PAGE_SIZE, VIEW_ALL_PAGE_SIZE } from '@/lib/admin/pagination'
import { PaginatedListFooter } from '@/components/admin/record/paginated-list-footer'
import { usePaginatedList } from '@/components/admin/record/use-paginated-list'
import { cn } from '@/lib/utils'

const AUDIT_GRID = 'grid grid-cols-[minmax(0,1.25fr)_minmax(6.5rem,10rem)_minmax(0,1fr)] gap-x-4'

export function AgentPromptAuditTable({
  stepId,
  viewAll = false,
}: {
  stepId: string
  viewAll?: boolean
}) {
  const pageSize = viewAll ? VIEW_ALL_PAGE_SIZE : EMBED_PAGE_SIZE
  const { items, pagination, loading, error, page, setPage, totalPages } =
    usePaginatedList<AgentPromptAuditEvent>({
      apiPath: `/api/admin/agents/${stepId}/prompt/audit`,
      pageSize,
      itemsKey: 'events',
      viewAll,
    })

  if (loading) return <p className="text-xs text-muted">Loading audit trail…</p>
  if (error) return <p className="text-xs text-destructive">{error}</p>

  return (
    <>
      <div className="min-w-0 w-full rounded-md border border-subtle text-sm">
        <div
          className={cn(
            AUDIT_GRID,
            'border-b border-[var(--record-section-header-border)] bg-[var(--record-section-header-bg)] px-3 py-2 text-xs font-medium text-[var(--record-section-header-fg)]'
          )}
        >
          <span>Action</span>
          <span>When</span>
          <span>Detail</span>
        </div>
        <ol className="divide-y divide-subtle">
          {items.length === 0 ? (
            <li className={cn(AUDIT_GRID, 'px-3 py-3 text-xs text-muted')}>
              <span className="col-span-full">No prompt changes recorded yet.</span>
            </li>
          ) : null}
          {items.map((event) => (
            <li key={event.actionId} className={cn(AUDIT_GRID, 'items-start px-3 py-2')}>
              <span className="font-mono text-xs">{event.actionType}</span>
              <time className="text-xs tabular-nums text-muted">{formatAdminDateTime(event.occurredAt)}</time>
              <div className="min-w-0 space-y-1 text-xs text-muted">
                {event.promptVersionId && (
                  <p className="font-mono text-[11px]">
                    version {String(event.detail.version_number ?? '—')}
                  </p>
                )}
                {typeof event.detail.change_note === 'string' && event.detail.change_note ? (
                  <p>{event.detail.change_note}</p>
                ) : null}
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
        viewAllHref={viewAll ? undefined : `/admin/agents/${stepId}/audit`}
      />
    </>
  )
}
