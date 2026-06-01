'use client'

import { Search } from 'lucide-react'

export function HeaderSearch() {
  return (
    <form action="/search" method="get" className="ml-auto w-full max-w-md shrink-0">
      <label htmlFor="header-search" className="sr-only">
        Search topics
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/50"
          aria-hidden
        />
        <input
          id="header-search"
          name="q"
          type="search"
          placeholder="Search topics…"
          autoComplete="off"
          className="search-input h-9 w-full rounded-md border border-sidebar-border bg-background/80 pl-9 pr-3 text-sm text-foreground shadow-none outline-none transition-shadow placeholder:text-muted-soft focus:ring-2 focus:ring-ring"
        />
      </div>
    </form>
  )
}
