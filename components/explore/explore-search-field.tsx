'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { SpotlightBorder } from '@/components/motion-primitives/spotlight-border'
import { searchPath } from '@/lib/explore-routes'

export function ExploreSearchField({
  initialQuery = '',
  autoFocus = false,
  className,
}: {
  initialQuery?: string
  autoFocus?: boolean
  className?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push(searchPath(q))
  }

  return (
    <form onSubmit={submit} className={className}>
      <SpotlightBorder className="rounded-bevel">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search debates, people, topics…"
          autoFocus={autoFocus}
          className="h-12 border-border bg-surface text-base shadow-panel-soft"
          aria-label="Search"
        />
      </SpotlightBorder>
    </form>
  )
}
