'use client'

import { ExternalLink, Newspaper, Youtube } from 'lucide-react'
import type { PartyAgreement, Position, PositionAdvocate } from '@/lib/mock/topic-explore'
import { cn } from '@/lib/utils'

const CONSERVATIVE_COLOR = '#991b1b'
const LIBERAL_COLOR = '#2563eb'

function ideologySummary(agreement: PartyAgreement): string {
  if (agreement.conservative > agreement.liberal + 10) {
    return 'This is a mostly conservative position.'
  }
  if (agreement.liberal > agreement.conservative + 10) {
    return 'This is a mostly liberal position.'
  }
  return 'This spans conservative and liberal support.'
}

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

export function PositionPopularitySnapshot({
  position,
  className,
}: {
  position: Position
  className?: string
}) {
  return (
    <figure
      className={cn(
        'mb-4 w-full rounded-bevel border border-subtle bg-surface p-4',
        'sm:float-right sm:clear-right sm:mb-3 sm:ml-5 sm:w-64',
        className
      )}
      data-testid="position-popularity-snapshot"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Who Agrees?</p>
          <PartyBars agreement={position.partyAgreement} />
          <p className="text-center text-[11px] italic leading-snug text-muted">
            {ideologySummary(position.partyAgreement)}
          </p>
        </div>

        <AdvocateLinks advocates={position.advocates} />
      </div>
    </figure>
  )
}

function PartyBars({ agreement }: { agreement: PartyAgreement }) {
  return (
    <div className="space-y-2">
      <PartyBar label="Conservatives" percent={agreement.conservative} color={CONSERVATIVE_COLOR} />
      <PartyBar label="Liberals" percent={agreement.liberal} color={LIBERAL_COLOR} />
    </div>
  )
}

function AdvocateSourceIcon({ sourceType }: { sourceType: PositionAdvocate['sourceType'] }) {
  if (sourceType === 'youtube') {
    return <Youtube className="size-3 shrink-0" aria-hidden />
  }
  return <Newspaper className="size-3 shrink-0" aria-hidden />
}

function AdvocateLinks({ advocates }: { advocates: PositionAdvocate[] }) {
  return (
    <div className="border-t border-subtle pt-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Popular Viewpoints</p>
      <ul className="space-y-1">
        {advocates.map((advocate) => (
          <li key={advocate.id}>
            <a
              href={advocate.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-surface-section"
              data-testid="position-advocate-link"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground transition-colors group-hover:text-link-default-blue dark:group-hover:text-link-default-green">
                  {advocate.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
                  <AdvocateSourceIcon sourceType={advocate.sourceType} />
                  <span className="truncate">{advocate.sourceLabel}</span>
                </span>
              </span>
              <ExternalLink
                className="size-3 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
