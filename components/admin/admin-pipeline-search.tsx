'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { adminSearchEntityLabel, type AdminSearchResult } from '@/lib/admin/admin-search'
import { cn } from '@/lib/utils'

function useAdminSearchQuery(initialQuery = '') {
  const [query, setQuery] = useState(initialQuery)
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
    if (!query.trim()) {
      setResults([])
      setError(null)
      return
    }
    const t = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, runSearch])

  return { query, setQuery, results, loading, error }
}

export function useAdminPipelineSearch() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const { query, setQuery, results, loading, error } = useAdminSearchQuery(initialQ)

  useEffect(() => {
    setQuery(initialQ)
  }, [initialQ, setQuery])

  return { query, setQuery, results, loading, error }
}

function AdminSearchResultsList({
  results,
  loading,
  error,
  query,
  onNavigate,
}: {
  results: AdminSearchResult[]
  loading: boolean
  error: string | null
  query: string
  onNavigate?: () => void
}) {
  const hasQuery = query.trim().length > 0

  if (!hasQuery && !loading) return null

  return (
    <div className="p-1">
      {loading && <p className="px-2 py-1.5 text-xs text-muted">Searching…</p>}
      {error && <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>}

      {!loading && !error && results.length === 0 && hasQuery && (
        <p className="px-2 py-1.5 text-xs text-muted">No results.</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {results.map((row) => (
            <li key={`${row.type}-${row.id}`}>
              <Link
                href={row.href}
                onClick={onNavigate}
                className="block rounded-sm px-2 py-1.5 transition-colors hover:bg-muted/60"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {adminSearchEntityLabel(row.type)}
                </p>
                <p className="mt-0.5 truncate text-xs leading-snug text-foreground">
                  {row.title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminPipelineSearchInput({
  query,
  setQuery,
  className,
  onFocus,
  onKeyDown,
  inputRef,
}: {
  query: string
  setQuery: (value: string) => void
  className?: string
  onFocus?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <Input
      ref={inputRef}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      placeholder="Search stories, claims, positions, events, agreements…"
      aria-label="Search pipeline records"
      autoComplete="off"
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
      <AdminSearchResultsList
        query={query}
        results={results}
        loading={loading}
        error={error}
      />
    </div>
  )
}

function AdminHeaderSearchInner({ className }: { className?: string }) {
  const { query, setQuery, results, loading, error } = useAdminSearchQuery()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = 'admin-header-search-results'

  const hasQuery = query.trim().length > 0
  const showDropdown = open && hasQuery

  useEffect(() => {
    if (!showDropdown) return

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [showDropdown])

  useEffect(() => {
    if (!hasQuery) setOpen(false)
  }, [hasQuery])

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            if (hasQuery) setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search stories, claims, positions, events, agreements…"
          aria-label="Search pipeline records"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          className="h-9 w-full bg-background pl-9 pr-3"
        />
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <AdminSearchResultsList
            query={query}
            results={results}
            loading={loading}
            error={error}
            onNavigate={() => {
              setOpen(false)
              setQuery('')
            }}
          />
        </div>
      )}
    </div>
  )
}

export function AdminHeaderSearch({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <AdminHeaderSearchInner className={className} />
    </Suspense>
  )
}
