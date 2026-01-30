'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/Button'

export function SearchBar() {
  const [query, setQuery] = useState('')

  return (
    <section aria-label="Search" className="w-full">
      <form action="/search" method="get" className="w-full">
        <label htmlFor="search-input" className="sr-only">
          Search for a headline or topic to research
        </label>
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <div className="relative h-[50px] min-w-0 flex-1">
            <input
              id="search-input"
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a topic"
              className="search-input h-full w-full rounded-bevel border border-subtle px-4 py-3 pr-10 text-base shadow-inset-soft placeholder:text-muted-soft outline-none transition-shadow focus:shadow-inset-strong"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-accent-secondary text-background transition-[color,transform] hover:bg-accent-secondary hover:text-background hover:scale-110 focus:outline-none focus:ring-0"
              >
                <X size={16} strokeWidth={2} aria-hidden />
              </button>
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
