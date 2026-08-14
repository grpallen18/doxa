'use client'

import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { FireRating } from '@/components/explore/fire-rating'
import { eidosPath, peoplePath } from '@/lib/explore-routes'
import type { ExplorePersonProfile } from '@/lib/explore/types'
import { cn } from '@/lib/utils'

function formatDelta(pct: number) {
  if (pct === 0) return '0%'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}

export function PersonIdentityRail({ profile }: { profile: ExplorePersonProfile }) {
  const { stats } = profile
  const waiting = !profile.projected ||
    (stats.mention_count === 0 &&
      stats.debate_count === 0 &&
      stats.document_count === 0)

  return (
    <aside className="space-y-4 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
      <Panel variant="soft" interactive={false} className="space-y-4 p-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Person</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {profile.name}
          </h1>
        </div>

        {profile.offices.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.offices.map((o) => (
              <span
                key={o.uid}
                className="rounded-md bg-surface-section px-2 py-0.5 text-xs text-muted"
              >
                {o.title || o.name}
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Coverage 30d
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {stats.coverage_30d}
            </p>
            <p
              className={cn(
                'text-xs tabular-nums',
                stats.delta_pct > 0 && 'text-accent-primary',
                stats.delta_pct < 0 && 'text-muted',
                stats.delta_pct === 0 && 'text-muted'
              )}
            >
              {formatDelta(stats.delta_pct)} vs prior
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Fire
            </p>
            <FireRating rating={stats.fire_rating} />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Debates
            </p>
            <p className="text-lg font-semibold tabular-nums">{stats.debate_count}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Claims
            </p>
            <p className="text-lg font-semibold tabular-nums">{stats.claim_count}</p>
          </div>
        </div>

        {waiting ? (
          <p className="text-xs leading-relaxed text-muted">
            Waiting on graph coverage. Stats fill in as the news graph projects this person.
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted">
            Derived from Doxa’s news graph — not a biography.
          </p>
        )}

        <Link
          href={eidosPath(profile.uid)}
          className="inline-flex w-full items-center justify-center rounded-bevel border border-border bg-surface px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-section"
        >
          View Eidos
        </Link>
      </Panel>

      {profile.related_people.length > 0 ? (
        <Panel variant="soft" interactive={false} className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Also mentioned with
          </p>
          <ul className="space-y-1.5">
            {profile.related_people.map((r) => (
              <li key={r.uid}>
                <Link
                  href={peoplePath(r.uid)}
                  className="text-sm text-foreground hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-xs text-muted"> · {r.co_mention_count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </aside>
  )
}
