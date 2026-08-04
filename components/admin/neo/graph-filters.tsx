'use client'

import { Button } from '@/components/ui/button'
import { NEO_KIND_LEGEND } from '@/lib/admin/neo-graph/appearance'
import { neoNodeFillGradient } from '@/lib/admin/neo-graph/colors'
import { useNeoKindColors } from '@/lib/admin/neo-graph/use-neo-colors'
import {
  ALL_NODE_KINDS,
  type NeoGraphFilters,
  type NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import { cn } from '@/lib/utils'

export function NeoGraphFiltersPanel({
  filters,
  onChange,
  className,
}: {
  filters: NeoGraphFilters
  onChange: (next: NeoGraphFilters) => void
  className?: string
}) {
  const toggleKind = (kind: NeoNodeKind) => {
    onChange({
      ...filters,
      kinds: { ...filters.kinds, [kind]: !filters.kinds[kind] },
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-black/55 p-3 text-zinc-200 shadow-xl backdrop-blur',
        className
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Node types
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_NODE_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={filters.kinds[kind] ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-full px-2.5 text-[11px]',
              filters.kinds[kind]
                ? 'bg-white/15 text-zinc-100 hover:bg-white/20'
                : 'border-white/15 bg-transparent text-zinc-500 hover:bg-white/5'
            )}
            onClick={() => toggleKind(kind)}
          >
            {kind}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function NeoGraphLegend({
  className,
  highlightKind = null,
}: {
  className?: string
  highlightKind?: NeoNodeKind | null
}) {
  const colors = useNeoKindColors()
  const items = NEO_KIND_LEGEND.map((item) => ({
    ...item,
    color: colors[item.kind] ?? item.color,
  }))

  return (
    <div
      className={cn(
        'max-w-full overflow-hidden px-1 py-0.5',
        className
      )}
    >
      <ul className="flex min-w-0 items-center justify-center gap-x-3 gap-y-1 overflow-x-auto">
        {items.map((item) => {
          const active = highlightKind === item.kind
          return (
            <li
              key={item.kind}
              className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-300"
            >
              <span
                className={cn(
                  'inline-block h-2.5 w-2.5 rounded-full transition-[box-shadow,transform,opacity] duration-300 ease-out',
                  active ? 'scale-110 opacity-100' : 'opacity-90'
                )}
                style={{
                  backgroundImage: neoNodeFillGradient(item.color),
                  boxShadow: active
                    ? `0 0 0 1px rgba(255,255,255,0.18), 0 0 4px 1px ${item.color}`
                    : '0 0 0 0 transparent',
                }}
              />
              {item.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
