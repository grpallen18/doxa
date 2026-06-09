'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { paginationLabel, type PaginationMeta } from '@/lib/admin/pagination'

export function PaginatedListFooter({
  pagination,
  page,
  totalPages,
  onPageChange,
  viewAllHref,
}: {
  pagination: PaginationMeta | null
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  viewAllHref?: string
}) {
  const showPager = (pagination?.total ?? 0) > 0 && totalPages > 1
  const showViewAll = viewAllHref && (pagination?.total ?? 0) > (pagination?.limit ?? 0)

  if (!showPager && !showViewAll && pagination) {
    return (
      <p className="mt-3 text-xs text-muted">{paginationLabel(pagination)}</p>
    )
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted">
        {pagination ? paginationLabel(pagination) : 'No records'}
      </p>
      <div className="flex items-center gap-2">
        {showPager && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </Button>
          </>
        )}
        {showViewAll && (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={viewAllHref}>View all</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
