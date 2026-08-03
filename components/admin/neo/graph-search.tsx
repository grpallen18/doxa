'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { searchProjectionNodes } from '@/lib/admin/neo-graph/graphology-adapter'
import type { DoxaGraphProjection } from '@/lib/admin/neo-graph/types'
import { cn } from '@/lib/utils'

export function NeoGraphSearch({
  projection,
  onSelect,
  className,
}: {
  projection: DoxaGraphProjection
  onSelect: (nodeId: string) => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(
    () => searchProjectionNodes(projection, query, 12),
    [projection, query]
  )

  return (
    <div className={cn('relative w-64 max-w-[70vw]', className)}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Search this view…"
        className="h-9 border-white/10 bg-black/55 text-sm text-zinc-100 placeholder:text-zinc-500 backdrop-blur"
      />
      <p className="mt-1 px-0.5 text-[10px] text-zinc-500">
        Searches loaded nodes only (story-scoped)
      </p>
      {open && query.trim() && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-white/10 bg-zinc-950/95 py-1 shadow-xl backdrop-blur">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">No matches</li>
          ) : (
            results.map((node) => (
              <li key={node.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start rounded-none px-3 py-2 text-left text-xs text-zinc-200 hover:bg-white/10 hover:text-white"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(node.id)
                    setQuery(node.label)
                    setOpen(false)
                  }}
                >
                  <span className="mr-2 uppercase tracking-wide text-zinc-500">
                    {node.kind}
                  </span>
                  <span className="line-clamp-2">{node.label}</span>
                </Button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
