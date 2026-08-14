'use client'

import { useMemo, useState } from 'react'
import { Panel } from '@/components/Panel'
import { ControversyListRow } from '@/components/explore/controversy-list-row'
import { SparseStatePanel } from '@/components/explore/sparse-state-panel'
import { DoxaLink } from '@/components/doxa-link'
import { controversyPath } from '@/lib/explore-routes'
import type { ExplorePersonProfile } from '@/lib/explore/types'
import { cn } from '@/lib/utils'

type TabId = 'coverage' | 'debates' | 'claims' | 'pulse'

function defaultTab(profile: ExplorePersonProfile): TabId {
  if (profile.controversies.length) return 'debates'
  if (profile.publishers.length || profile.recent_documents.length) return 'coverage'
  if (profile.sample_propositions.length) return 'claims'
  if (profile.pulse.length) return 'pulse'
  return 'debates'
}

export function PersonProfileMain({ profile }: { profile: ExplorePersonProfile }) {
  const initial = useMemo(() => defaultTab(profile), [profile])
  const [tab, setTab] = useState<TabId>(initial)

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'coverage', label: 'Coverage', count: profile.publishers.length || profile.recent_documents.length },
    { id: 'debates', label: 'Debates', count: profile.controversies.length },
    { id: 'claims', label: 'Claims', count: profile.sample_propositions.length },
    { id: 'pulse', label: 'Pulse', count: profile.pulse.length },
  ]

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
              tab === t.id
                ? 'border-accent-primary text-foreground'
                : 'border-transparent text-muted hover:text-foreground'
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 ? (
              <span className="ml-1.5 tabular-nums text-muted">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'coverage' ? <CoverageTab profile={profile} /> : null}
      {tab === 'debates' ? <DebatesTab profile={profile} /> : null}
      {tab === 'claims' ? <ClaimsTab profile={profile} /> : null}
      {tab === 'pulse' ? <PulseTab profile={profile} /> : null}
    </div>
  )
}

function CoverageTab({ profile }: { profile: ExplorePersonProfile }) {
  const maxPub = Math.max(1, ...profile.publishers.map((p) => p.doc_count))
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Frequently covered by
        </h2>
        {profile.publishers.length === 0 ? (
          <SparseStatePanel>No outlets linked yet.</SparseStatePanel>
        ) : (
          <ul className="space-y-2">
            {profile.publishers.map((p) => (
              <li key={p.publication_uid}>
                <Panel variant="soft" interactive={false} className="space-y-1.5 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs tabular-nums text-muted">{p.doc_count} docs</p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-section">
                    <div
                      className="h-full rounded-full bg-accent-primary/70"
                      style={{ width: `${Math.round((p.doc_count / maxPub) * 100)}%` }}
                    />
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Recent stories
        </h2>
        {profile.recent_documents.length === 0 ? (
          <SparseStatePanel>No recent stories in the graph.</SparseStatePanel>
        ) : (
          <ul className="space-y-2">
            {profile.recent_documents.map((d) => (
              <li key={d.document_uid}>
                <Panel variant="soft" interactive={false} className="space-y-1 p-3">
                  {d.story_url ? (
                    <a
                      href={d.story_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {d.story_title || 'Untitled story'}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-foreground">
                      {d.story_title || 'Untitled story'}
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    {[d.publication_name, d.published_at?.slice(0, 10)].filter(Boolean).join(' · ')}
                    {d.mention_count > 0 ? ` · ${d.mention_count} mentions` : ''}
                  </p>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile.topics.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Common topics
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.topics.map((t) => (
              <span
                key={t.key}
                className="rounded-md bg-surface-section px-2.5 py-1 text-xs text-foreground"
              >
                {t.label}
                <span className="text-muted"> · {t.debate_count}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function DebatesTab({ profile }: { profile: ExplorePersonProfile }) {
  if (profile.controversies.length === 0) {
    return (
      <SparseStatePanel title="No mapped debates yet">
        Claims about this person may appear before debates are assembled.
      </SparseStatePanel>
    )
  }
  return (
    <div className="space-y-3">
      {profile.controversies.map((c) => (
        <ControversyListRow key={c.uid} item={c} />
      ))}
    </div>
  )
}

function ClaimsTab({ profile }: { profile: ExplorePersonProfile }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Claims about them
        </h2>
        {profile.sample_propositions.length === 0 ? (
          <SparseStatePanel>No claims mention this person yet.</SparseStatePanel>
        ) : (
          <ul className="space-y-2">
            {profile.sample_propositions.map((p) => (
              <li key={p.uid}>
                <Panel variant="soft" interactive={false} className="space-y-2 p-3">
                  <p className="text-sm leading-relaxed text-foreground">{p.text}</p>
                  {p.controversy_uid ? (
                    <DoxaLink href={controversyPath(p.controversy_uid)}>Open debate</DoxaLink>
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile.attributed_remarks.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Attributed remarks
          </h2>
          <ul className="space-y-2">
            {profile.attributed_remarks.map((r) => (
              <li key={r.proposition_uid}>
                <Panel variant="soft" interactive={false} className="space-y-1 p-3">
                  <p className="text-sm leading-relaxed text-foreground">{r.text}</p>
                  <p className="text-xs text-muted">Attributed as {r.agent_name}</p>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function PulseTab({ profile }: { profile: ExplorePersonProfile }) {
  if (profile.pulse.length === 0) {
    return (
      <SparseStatePanel>Not enough dated coverage for a pulse.</SparseStatePanel>
    )
  }
  const max = Math.max(1, ...profile.pulse.map((b) => b.doc_count))
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Coverage by month
      </h2>
      <div className="flex h-36 items-end gap-1.5">
        {profile.pulse.map((b) => (
          <div key={b.bucket} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm bg-accent-primary/70"
              style={{ height: `${Math.max(8, Math.round((b.doc_count / max) * 100))}%` }}
              title={`${b.bucket}: ${b.doc_count}`}
            />
            <span className="truncate text-[10px] text-muted">{b.bucket.slice(2)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        Last 30 days: {profile.stats.coverage_30d} stories · prior 30:{' '}
        {profile.stats.coverage_prior_30d}
      </p>
    </div>
  )
}