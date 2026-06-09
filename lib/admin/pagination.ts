export const EMBED_PAGE_SIZE = 10
export const VIEW_ALL_PAGE_SIZE = 100

export type PaginationMeta = {
  limit: number
  offset: number
  total: number
  hasMore: boolean
}

export type PaginationParams = {
  limit: number
  offset: number
}

export function parsePaginationSearchParams(
  searchParams: URLSearchParams,
  defaultLimit = EMBED_PAGE_SIZE,
  maxLimit = VIEW_ALL_PAGE_SIZE
): PaginationParams {
  const rawLimit = Number.parseInt(searchParams.get('limit') ?? String(defaultLimit), 10)
  const rawOffset = Number.parseInt(searchParams.get('offset') ?? '0', 10)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(maxLimit, Math.max(1, rawLimit))
    : defaultLimit
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0
  return { limit, offset }
}

export function buildPaginationMeta(
  limit: number,
  offset: number,
  total: number
): PaginationMeta {
  return {
    limit,
    offset,
    total,
    hasMore: offset + limit < total,
  }
}

export function pageCount(total: number, pageSize: number): number {
  if (total <= 0) return 1
  return Math.ceil(total / pageSize)
}

export function paginationLabel(meta: PaginationMeta): string {
  if (meta.total === 0) return 'No records'
  const start = meta.offset + 1
  const end = Math.min(meta.offset + meta.limit, meta.total)
  return `${start}–${end} of ${meta.total}`
}
