'use client'

import type { HistoryEvent } from '@/lib/admin/history'
import { EMBED_PAGE_SIZE, VIEW_ALL_PAGE_SIZE } from '@/lib/admin/pagination'
import { AuditTimeline } from '@/components/admin/record/audit-timeline'
import { PaginatedListFooter } from '@/components/admin/record/paginated-list-footer'
import { usePaginatedList } from '@/components/admin/record/use-paginated-list'

export function AuditHistoryPanel({
  apiPath,
  viewAllHref,
  viewAll = false,
  emptyMessage = 'No records',
}: {
  apiPath: string
  viewAllHref?: string
  viewAll?: boolean
  emptyMessage?: string
}) {
  const pageSize = viewAll ? VIEW_ALL_PAGE_SIZE : EMBED_PAGE_SIZE
  const { items, pagination, loading, error, page, setPage, totalPages } =
    usePaginatedList<HistoryEvent>({
      apiPath,
      pageSize,
      itemsKey: 'events',
      viewAll,
    })

  if (loading) return <p className="text-xs text-muted">Loading audit history…</p>
  if (error) return <p className="text-xs text-destructive">{error}</p>

  return (
    <>
      <AuditTimeline events={items} emptyMessage={emptyMessage} />
      <PaginatedListFooter
        pagination={pagination}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        viewAllHref={viewAll ? undefined : viewAllHref}
      />
    </>
  )
}
