'use client'

import { cn } from '@/lib/utils'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import { PositionAdvocatesMarquee } from '@/components/position-advocates-marquee'
import { PositionAgreementMeter } from '@/components/position-agreement-meter'
import type { Position } from '@/lib/mock/topic-explore'

export function PositionCard({
  position,
  selected,
  onSelect,
}: {
  position: Position
  selected: boolean
  onSelect: (id: string) => void
}) {
  const accent = positionAccentVar(position.ordinal)
  const advocateNames = position.advocates.map((a) => a.name)

  return (
    <button
      type="button"
      data-testid="position-card"
      onClick={() => onSelect(position.id)}
      aria-pressed={selected}
      className={cn(
        'grid h-full w-full min-w-0 overflow-hidden grid-rows-[auto_auto_1fr] gap-3 rounded-bevel border bg-surface p-4 text-left transition-colors',
        'hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-2 shadow-panel-soft' : 'border border-subtle'
      )}
      style={selected ? { borderColor: accent } : undefined}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">
            {position.headline}
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {position.sources.toLocaleString()} sources
          </span>
        </div>
        <p className="line-clamp-3 text-xs leading-relaxed text-muted">{position.description}</p>
      </div>

      <div className="min-w-0 overflow-hidden">
        <PositionAgreementMeter percent={position.agreementPct} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-col justify-end space-y-1 overflow-hidden">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Notable advocates</p>
        <PositionAdvocatesMarquee names={advocateNames} />
      </div>
    </button>
  )
}
