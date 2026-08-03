'use client'

import { Button } from '@/components/ui/button'
import { NEO_KIND_LEGEND } from '@/lib/admin/neo-graph/appearance'
import { useNeoKindColors } from '@/lib/admin/neo-graph/use-neo-colors'
import {
  ALL_EDGE_TYPES,
  ALL_NODE_KINDS,
  type NeoEdgeType,
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

  const toggleEdge = (type: NeoEdgeType) => {
    onChange({
      ...filters,
      edgeTypes: { ...filters.edgeTypes, [type]: !filters.edgeTypes[type] },
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

      <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Relationships
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ALL_EDGE_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={filters.edgeTypes[type] ? 'default' : 'outline'}
            className={cn(
              'h-7 rounded-full px-2.5 text-[10px]',
              filters.edgeTypes[type]
                ? 'bg-white/15 text-zinc-100 hover:bg-white/20'
                : 'border-white/15 bg-transparent text-zinc-500 hover:bg-white/5'
            )}
            onClick={() => toggleEdge(type)}
          >
            {type}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function NeoGraphLegend({ className }: { className?: string }) {
  const colors = useNeoKindColors()
  const items = NEO_KIND_LEGEND.map((item) => ({
    ...item,
    color: colors[item.kind] ?? item.color,
  }))

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-black/55 px-3 py-2 shadow-xl backdrop-blur',
        className
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Legend
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.kind} className="flex items-center gap-2 text-[11px] text-zinc-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
