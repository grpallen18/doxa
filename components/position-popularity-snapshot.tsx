'use client'

import { positionAccentVar } from '@/lib/topic-explore-ui'
import type { PartyAgreement, Position } from '@/lib/mock/topic-explore'
import { cn } from '@/lib/utils'

const REP_COLOR = '#991b1b'
const DEM_COLOR = '#2563eb'

function PartyBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="shrink-0 tabular-nums font-medium text-foreground">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
          aria-hidden
        />
      </div>
    </div>
  )
}

function formatAgreementRank(rank: number, total: number): string {
  if (rank === 1) return 'Most agreed position on this topic'
  if (rank === total) return 'Least agreed position on this topic'
  const suffix =
    rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'
  return `${rank}${suffix} of ${total} positions by agreement`
}

export function PositionPopularitySnapshot({
  position,
  agreementRank,
  topicPositionCount,
  className,
}: {
  position: Position
  agreementRank?: number
  topicPositionCount?: number
  className?: string
}) {
  const accent = positionAccentVar(position.ordinal)
  const showRank =
    agreementRank != null &&
    topicPositionCount != null &&
    topicPositionCount > 1

  return (
    <figure
      className={cn(
        'mb-4 w-full rounded-bevel border border-subtle bg-surface p-3 shadow-panel-soft',
        'sm:float-right sm:clear-right sm:mb-3 sm:ml-5 sm:w-56',
        className
      )}
      data-testid="position-popularity-snapshot"
    >
      <figcaption className="mb-3 text-[10px] font-medium uppercase tracking-wide text-muted">
        At a glance
      </figcaption>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p
              className="text-3xl font-semibold leading-none tabular-nums tracking-tight"
              style={{ color: accent }}
            >
              {position.agreementPct}%
            </p>
            <p className="mt-1 text-xs text-muted">agree with this position</p>
          </div>
          {showRank && (
            <p className="max-w-[7rem] text-right text-[10px] leading-snug text-muted">
              {formatAgreementRank(agreementRank, topicPositionCount)}
            </p>
          )}
        </div>

        <PartyBars agreement={position.partyAgreement} />

        <dl className="grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-center">
          <Stat label="Sources" value={position.sources} />
          <Stat label="Stories" value={position.storyCount} />
          <Stat label="Advocates" value={position.advocates.length} />
        </dl>

        <p className="text-center text-[11px] text-muted">{position.disagreement}</p>
      </div>
    </figure>
  )
}

function PartyBars({ agreement }: { agreement: PartyAgreement }) {
  return (
    <div className="space-y-2">
      <PartyBar label="Republican" percent={agreement.republican} color={REP_COLOR} />
      <PartyBar label="Democrat" percent={agreement.democrat} color={DEM_COLOR} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

export function getPositionAgreementRank(
  positionId: string,
  positions: Pick<Position, 'id' | 'agreementPct'>[]
): number {
  const sorted = [...positions].sort((a, b) => b.agreementPct - a.agreementPct)
  const index = sorted.findIndex((p) => p.id === positionId)
  return index === -1 ? 0 : index + 1
}
