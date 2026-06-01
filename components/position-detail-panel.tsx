'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { positionAccentVar } from '@/lib/topic-explore-ui'
import { detailTabs, type DetailTab, type Position, type SupportingClaim, type RelatedControversy } from '@/lib/mock/topic-explore'

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return null
  const width = 56
  const height = 18
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const step = width / (points.length - 1 || 1)
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="shrink-0">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

function ClaimRow({ claim, accent }: { claim: SupportingClaim; accent: string }) {
  return (
    <li className="space-y-1.5 rounded-md border border-subtle bg-surface p-3">
      <p className="text-xs leading-relaxed text-foreground">{claim.text}</p>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
            <span>Agreement</span>
            <span className="tabular-nums">{claim.agreement}%</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${claim.agreement}%`, backgroundColor: accent }} />
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-muted">
          <span className="block">Sources</span>
          <span className="tabular-nums text-foreground">{claim.sources}</span>
        </div>
      </div>
    </li>
  )
}

function ControversyRow({ item, accent }: { item: RelatedControversy; accent: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-subtle bg-surface p-3">
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{item.title}</span>
      <Sparkline points={item.trend} color="var(--destructive)" />
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{item.impact}</span>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </div>
  )
}

export function PositionDetailPanel({
  position,
  onClose,
  hideClose = false,
}: {
  position: Position
  onClose: () => void
  hideClose?: boolean
}) {
  const [tab, setTab] = useState<DetailTab>('Overview')
  const accent = positionAccentVar(position.ordinal)

  const showClaims = tab === 'Overview' || tab === 'Claims' || tab === 'Evidence'
  const showControversies = tab === 'Overview' || tab === 'Trends'
  const showSources = tab === 'Overview' || tab === 'Sources'

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-subtle p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Position {position.ordinal} Selected
          </span>
          {!hideClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close position detail"
              className="rounded-md p-1 text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <h2 className="text-sm font-semibold leading-snug text-foreground">{position.headline}</h2>
        <div className="flex items-center justify-between text-xs">
          <span className="tabular-nums text-muted">{position.sources.toLocaleString()} sources</span>
          <span style={{ color: 'var(--destructive)' }}>{position.disagreement}</span>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-subtle px-2 py-2">
        {detailTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={cn(
              'whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors',
              tab === t ? 'bg-surface-soft text-foreground' : 'text-muted hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {showClaims && (
          <Section title="Key Supporting Claims">
            <ul className="space-y-2">
              {position.supportingClaims.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} accent={accent} />
              ))}
            </ul>
          </Section>
        )}

        {showClaims && (
          <Section title="Top Opposing Claims">
            <ul className="space-y-2">
              {position.opposingClaims.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} accent="var(--muted-soft)" />
              ))}
            </ul>
          </Section>
        )}

        {showSources && tab === 'Sources' && (
          <Section title="Source Counts">
            <p className="text-xs text-muted">
              {position.sources.toLocaleString()} sources across supporting and opposing claims.
            </p>
          </Section>
        )}

        {showControversies && (
          <Section title="Related Controversies">
            <ul className="space-y-2">
              {position.relatedControversies.map((item) => (
                <ControversyRow key={item.id} item={item} accent={accent} />
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}
