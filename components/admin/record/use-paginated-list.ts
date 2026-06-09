'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PaginationMeta } from '@/lib/admin/pagination'
import { pageCount } from '@/lib/admin/pagination'

export function usePaginatedList<T>({
  apiPath,
  pageSize,
  itemsKey = 'events',
  viewAll = false,
}: {
  apiPath: string
  pageSize: number
  itemsKey?: string
  viewAll?: boolean
}) {
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<T[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const offset = page * pageSize
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    })
    if (viewAll) params.set('view', 'all')

    try {
      const res = await fetch(`${apiPath}?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error || !json.data) {
        setError(json.error?.message ?? 'Failed to load records')
        setItems([])
        setPagination(null)
        return
      }
      const list = json.data[itemsKey]
      setItems(Array.isArray(list) ? (list as T[]) : [])
      setPagination(json.data.pagination ?? null)
    } catch {
      setError('Failed to load records')
      setItems([])
      setPagination(null)
    } finally {
      setLoading(false)
    }
  }, [apiPath, page, pageSize, itemsKey, viewAll])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = pagination ? pageCount(pagination.total, pageSize) : 1

  return {
    items,
    pagination,
    loading,
    error,
    page,
    setPage,
    totalPages,
    reload: load,
  }
}
