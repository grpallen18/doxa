'use client'

import { useMemo, useState } from 'react'
import { ArrowDownAZ, ArrowDownWideNarrow, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { Position } from '@/lib/mock/topic-explore'

type SortKey = 'sources' | 'agreement' | 'ordinal'

const sortOptions: { key: SortKey; label: string; icon: typeof ArrowDownWideNarrow }[] = [
  { key: 'sources', label: 'Sources', icon: ArrowDownWideNarrow },
  { key: 'agreement', label: 'Agreement', icon: ArrowDownAZ },
  { key: 'ordinal', label: 'Order', icon: Hash },
]

function DiscourseStrip({ positions }: { positions: Position[] }) {
  const totalSources = positions.reduce((sum, p) => sum + p.sources, 0)
  if (totalSources === 0) return null

  const segments = positions.map((position) => ({
    position,
    share: (position.sources / totalSources) * 100,
  }))

  return (
    <div className="space-y-2 rounded-bevel border border-subtle bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Where discourse concentrates
        </p>
        <p className="text-[11px] text-muted">By source volume</p>
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={segments
          .map(({ position, share }) => `${position.headline}: ${Math.round(share)}% of sources`)
          .join('; ')}
      >
        {segments.map(({ position, share }) => (
          <div
            key={position.id}
            className="h-full min-w-[2px] transition-[flex-grow] duration-300"
            style={{
              flexGrow: share,
              backgroundColor: positionAccentVar(position.ordinal),
            }}
            title={`${position.headline} — ${Math.round(share)}%`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(({ position, share }) => (
          <li key={position.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: positionAccentVar(position.ordinal) }}
              aria-hidden
            />
            <span className="truncate">{position.headline}</span>
            <span className="shrink-0 tabular-nums">{Math.round(share)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PartySplit({ agreement }: { agreement: Position['partyAgreement'] }) {
  return (
    <span className="hidden shrink-0 tabular-nums text-[11px] text-muted sm:inline">
      <span style={{ color: '#991b1b' }}>C {agreement.conservative}%</span>
      <span className="mx-1 text-muted/60">·</span>
      <span style={{ color: '#2563eb' }}>L {agreement.liberal}%</span>
    </span>
  )
}

function PositionListRow({
  position,
  selected,
  onSelect,
}: {
  position: Position
  selected: boolean
  onSelect: (id: string) => void
}) {
  const accent = positionAccentVar(position.ordinal)

  return (
    <button
      type="button"
      data-testid="position-list-row"
      onClick={() => onSelect(position.id)}
      aria-pressed={selected}
      className={cn(
        'flex w-full min-w-0 items-stretch gap-0 rounded-bevel border text-left transition-colors',
        'hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-2 bg-surface-soft shadow-panel-soft' : 'border border-subtle bg-surface'
      )}
      style={selected ? { borderColor: accent } : undefined}
    >
      <div className="w-1 shrink-0 rounded-l-bevel" style={{ backgroundColor: accent }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start gap-2">
            <span
              className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted"
              aria-hidden
            >
              {position.ordinal}
            </span>
            <h3 className="min-w-0 text-sm font-semibold leading-snug text-foreground">
              {position.headline}
            </h3>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted sm:line-clamp-1 sm:pl-5">
            {position.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 pl-5 sm:flex-col sm:items-end sm:gap-1.5 sm:pl-0">
          <span className="text-xs tabular-nums text-muted">
            {position.sources.toLocaleString()} sources
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-white"
            style={{ backgroundColor: accent }}
          >
            {position.agreementPct}% agree
          </span>
          <PartySplit agreement={position.partyAgreement} />
        </div>
      </div>
    </button>
  )
}

export function PositionListExplore({
  positions,
  selectedId,
  onSelect,
}: {
  positions: Position[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('sources')

  const sortedPositions = useMemo(() => {
    const copy = [...positions]
    switch (sortKey) {
      case 'agreement':
        return copy.sort((a, b) => b.agreementPct - a.agreementPct || a.ordinal - b.ordinal)
      case 'ordinal':
        return copy.sort((a, b) => a.ordinal - b.ordinal)
      default:
        return copy.sort((a, b) => b.sources - a.sources || a.ordinal - b.ordinal)
    }
  }, [positions, sortKey])

  return (
    <section aria-label="Positions list view" className="space-y-4" data-testid="position-list-explore">
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Positions — list view</h2>
          <div className="flex items-center gap-1 rounded-md border border-subtle bg-surface p-0.5">
            {sortOptions.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                aria-pressed={sortKey === key}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                  sortKey === key
                    ? 'bg-surface-soft text-foreground'
                    : 'text-muted hover:text-foreground'
                )}
              >
                <Icon className="size-3" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Alternative layout for comparison. Agreement percentages are independent per stance — they do
          not add up to 100%. The bar below shows how source volume is distributed.
        </p>
      </div>

      <DiscourseStrip positions={positions} />

      <ul className="space-y-2">
        {sortedPositions.map((position) => (
          <li key={position.id}>
            <PositionListRow
              position={position}
              selected={position.id === selectedId}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
