'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import type { AdminSearchResult } from '@/lib/admin/admin-search'

export function useAdminPipelineSearch() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(initialQ)
  const [results, setResults] = useState<AdminSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}&limit=20`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error?.message ?? 'Search failed')
        setResults([])
        return
      }
      setResults(json.data?.results ?? [])
    } catch {
      setError('Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setQuery(initialQ)
    if (initialQ.trim()) void runSearch(initialQ)
  }, [initialQ, runSearch])

  useEffect(() => {
    if (!query.trim()) return
    const t = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  return { query, setQuery, results, loading, error }
}

export function AdminPipelineSearchInput({
  query,
  setQuery,
  className,
}: {
  query: string
  setQuery: (value: string) => void
  className?: string
}) {
  return (
    <Input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search stories, claims, positions, events, agreements…"
      aria-label="Search pipeline records"
      className={className}
    />
  )
}

export function AdminPipelineSearchResults({
  query,
  results,
  loading,
  error,
}: {
  query: string
  results: AdminSearchResult[]
  loading: boolean
  error: string | null
}) {
  const hasQuery = query.trim().length > 0
  if (!hasQuery && !loading) return null

  return (
    <div className="space-y-2">
      {loading && <p className="text-xs text-muted">Searching…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {!loading && !error && results.length === 0 && hasQuery && (
        <p className="text-xs text-muted">No results.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {results.map((row) => (
            <li key={`${row.type}-${row.id}`}>
              <Link
                href={row.href}
                className="block px-3 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">
                    {row.type}
                    {row.stageBadge ? ` · ${row.stageBadge}` : ''}
                  </span>
                  <span className="min-w-0 truncate text-sm leading-snug">{row.title}</span>
                </div>
                {row.subtitle && (
                  <p className="mt-0.5 truncate text-[11px] text-muted">{row.subtitle}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
