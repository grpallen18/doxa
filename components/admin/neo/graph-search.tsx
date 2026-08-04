'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { searchProjectionNodes } from '@/lib/admin/neo-graph/graphology-adapter'
import type { DoxaGraphProjection } from '@/lib/admin/neo-graph/types'
import { cn } from '@/lib/utils'

export function NeoGraphSearch({
  projection,
  onSelect,
  onHoverNode,
  onClose,
  className,
}: {
  projection: DoxaGraphProjection
  onSelect: (nodeId: string) => void
  onHoverNode?: (nodeId: string | null) => void
  onClose?: () => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => searchProjectionNodes(projection, query, 12),
    [projection, query]
  )

  const clearHover = () => onHoverNode?.(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearHover()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  return (
    <div className={cn('relative w-full', className)}>
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setListOpen(true)
        }}
        onFocus={() => setListOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setListOpen(false)
            clearHover()
          }, 150)
        }}
        placeholder="Search this view…"
        className="h-8 border-white/10 bg-black/70 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none backdrop-blur"
      />
      {listOpen && query.trim() ? (
        <ul
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded-lg border border-white/10 bg-zinc-950/95 py-1 shadow-xl backdrop-blur"
          onMouseLeave={clearHover}
        >
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
                  onMouseEnter={() => onHoverNode?.(node.id)}
                  onClick={() => {
                    onSelect(node.id)
                    setQuery(node.label)
                    setListOpen(false)
                    clearHover()
                    onClose?.()
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
      ) : null}
    </div>
  )
}
