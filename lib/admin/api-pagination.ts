import {
  buildPaginationMeta,
  EMBED_PAGE_SIZE,
  parsePaginationSearchParams,
  VIEW_ALL_PAGE_SIZE,
  type PaginationMeta,
} from '@/lib/admin/pagination'

export function parseAuditListParams(
  searchParams: URLSearchParams,
  mode: 'embed' | 'view_all' = 'embed'
) {
  const defaultLimit = mode === 'view_all' ? VIEW_ALL_PAGE_SIZE : EMBED_PAGE_SIZE
  const maxLimit = VIEW_ALL_PAGE_SIZE
  return parsePaginationSearchParams(searchParams, defaultLimit, maxLimit)
}

export function paginatedApiPayload<T>(
  items: T[],
  limit: number,
  offset: number,
  total: number,
  itemsKey = 'events'
): Record<string, unknown> & { pagination: PaginationMeta } {
  return {
    [itemsKey]: items,
    pagination: buildPaginationMeta(limit, offset, total),
  } as Record<string, unknown> & { pagination: PaginationMeta }
}
