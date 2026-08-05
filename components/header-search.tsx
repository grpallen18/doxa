'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function HeaderSearch({ className }: { className?: string }) {
  return (
    <form action="/search" method="get" className={cn('w-full max-w-md', className)}>
      <label htmlFor="header-search" className="sr-only">
        Search topics
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          id="header-search"
          name="q"
          type="search"
          placeholder="Search topics…"
          autoComplete="off"
          className="h-9 bg-surface-section pl-9 pr-3 text-foreground placeholder:text-muted"
        />
      </div>
    </form>
  )
}
