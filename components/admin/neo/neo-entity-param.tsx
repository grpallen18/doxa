'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Search, X } from 'lucide-react'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import {
  ENTITY_SEARCH_MIN_CHARS,
  type NeoEntitySuggestion,
} from '@/lib/admin/neo-graph/entity-search'
import { cn } from '@/lib/utils'

export function NeoEntityParam({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: NeoEntitySuggestion | null
  onSelect: (next: NeoEntitySuggestion | null) => void
  disabled?: boolean
}) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(selected?.name ?? '')
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<NeoEntitySuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!focused) setQuery(selected?.name ?? '')
  }, [focused, selected])

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < ENTITY_SEARCH_MIN_CHARS) {
      setResults([])
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/neo/entities?q=${encodeURIComponent(trimmed)}`
      )
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json?.error?.message ?? 'Search failed')
        setResults([])
        return
      }
      setResults((json.data?.results ?? []) as NeoEntitySuggestion[])
      setActiveIndex(0)
    } catch {
      setError('Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < ENTITY_SEARCH_MIN_CHARS) {
      setResults([])
      setError(null)
      return
    }
    const t = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(t)
  }, [open, query, runSearch])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const pick = (row: NeoEntitySuggestion) => {
    onSelect(row)
    setQuery(row.name)
    setOpen(false)
    inputRef.current?.blur()
    setFocused(false)
  }

  const clear = () => {
    onSelect(null)
    setQuery('')
    setResults([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const showDropdown = open && query.trim().length >= ENTITY_SEARCH_MIN_CHARS

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!showDropdown || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = results[activeIndex]
      if (row) pick(row)
    }
  }

  return (
    <div ref={containerRef} className="relative flex w-56 flex-col gap-1">
      <label
        htmlFor="neo-union-entity"
        className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
      >
        entity
      </label>
      <SpotlightBorder
        active={focused && !disabled}
        className="w-auto bg-white/20 shadow-lg"
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            ref={inputRef}
            id="neo-union-entity"
            type="search"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={showDropdown ? listboxId : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Search entities…"
            disabled={disabled}
            value={query}
            onChange={(e) => {
              const next = e.target.value
              setQuery(next)
              setOpen(true)
              setFocused(true)
              if (selected && next.trim() !== selected.name) onSelect(null)
            }}
            onFocus={() => {
              setFocused(true)
              if (query.trim().length >= ENTITY_SEARCH_MIN_CHARS) setOpen(true)
            }}
            onKeyDown={onKeyDown}
            className="relative flex h-8 w-full rounded-[calc(theme(borderRadius.md)-1px)] border-0 bg-black/80 py-0 pl-7 pr-7 text-sm font-medium text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:bg-black/90 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden"
          />
          {selected || query ? (
            <button
              type="button"
              aria-label="Clear entity"
              disabled={disabled}
              onClick={clear}
              className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </SpotlightBorder>
      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-white/10 bg-black/90 text-zinc-200 shadow-lg"
        >
          <div className="p-1">
            {loading ? (
              <p className="px-2 py-1.5 text-xs text-zinc-500">Searching…</p>
            ) : null}
            {error ? (
              <p className="px-2 py-1.5 text-xs text-red-400">{error}</p>
            ) : null}
            {!loading && !error && results.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-zinc-500">No entities.</p>
            ) : null}
            {results.length > 0 ? (
              <ul className="max-h-64 overflow-y-auto">
                {results.map((row, i) => (
                  <li key={row.uid}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => pick(row)}
                      className={cn(
                        'flex w-full flex-col rounded-sm px-2 py-1.5 text-left transition-colors',
                        i === activeIndex ? 'bg-white/10' : 'hover:bg-white/5'
                      )}
                    >
                      {row.kindHint ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          {row.kindHint}
                        </span>
                      ) : null}
                      <span className="truncate text-xs text-zinc-100">
                        {row.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
