'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/Button'

type TopicSuggestion = {
  topic_id: string
  title: string
  slug: string
  summary: string | null
}

const DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

export function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/topics/search?q=${encodeURIComponent(q)}&limit=8`)
      const json = await res.json()
      if (res.ok && json?.data) {
        setSuggestions(json.data)
        setShowDropdown(true)
        setHighlightedIndex(-1)
      } else {
        setSuggestions([])
      }
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(query.trim())
      debounceRef.current = null
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, fetchSuggestions])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSuggestionClick(topicId: string) {
    setShowDropdown(false)
    setSuggestions([])
    setQuery('')
    router.push(`/page/${topicId}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      handleSuggestionClick(suggestions[highlightedIndex].topic_id)
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
      setHighlightedIndex(-1)
    }
  }

  return (
    <section aria-label="Search" className="w-full">
      <form action="/search" method="get" className="w-full">
        <label htmlFor="search-input" className="sr-only">
          Search for a headline or topic to research
        </label>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <div ref={containerRef} className="relative min-w-0 flex-1">
            <div className="relative h-[50px]">
              <input
                id="search-input"
                type="search"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                placeholder="Search a topic"
                className="search-input h-full w-full rounded-bevel border border-subtle px-4 py-3 pr-10 text-base shadow-inset-soft placeholder:text-muted-soft outline-none transition-shadow focus:shadow-inset-strong"
                autoComplete="off"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setSuggestions([])
                    setShowDropdown(false)
                  }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-accent-secondary text-background transition-[color,transform] hover:bg-accent-secondary hover:text-background hover:scale-110 focus:outline-none focus:ring-0"
                >
                  <X size={16} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
            {showDropdown && (
              <div
                className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-bevel border border-subtle bg-surface shadow-panel-soft"
                role="listbox"
              >
                {loading ? (
                  <div className="px-4 py-3 text-sm text-muted">Searching…</div>
                ) : suggestions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted">No topics found</div>
                ) : (
                  suggestions.map((topic, i) => (
                    <button
                      key={topic.topic_id}
                      type="button"
                      role="option"
                      aria-selected={i === highlightedIndex}
                      className={`block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                        i === highlightedIndex ? 'bg-muted/50' : ''
                      }`}
                      onClick={() => handleSuggestionClick(topic.topic_id)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      <p className="font-medium text-foreground">{topic.title}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button type="submit" variant="primary" className="min-h-[48px] shrink-0 px-6">
            Search
          </Button>
        </div>
      </form>
    </section>
  )
}
