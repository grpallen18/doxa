'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Panel } from '@/components/Panel'

type Tab = 'positions' | 'controversies' | 'viewpoints'

type Stats = {
  positions_24h: number
  controversies_24h: number
  viewpoints_24h: number
  positions_active: number
  controversies_active: number
  viewpoints_active: number
}

type PositionRow = {
  position_cluster_id: string
  label: string | null
  summary: string | null
  status: string
  created_at: string
  claim_count: number
  controversy_count: number
}

type ControversyRow = {
  controversy_cluster_id: string
  question: string | null
  summary: string | null
  status: string
  created_at: string
  position_count: number
  viewpoint_count: number
}

type ViewpointRow = {
  viewpoint_id: string
  title: string | null
  summary: string
  controversy_cluster_id: string
  position_cluster_id: string
  controversy_question: string | null
  position_label: string | null
  created_at: string
}

type PositionDetail = {
  position_cluster_id: string
  label: string | null
  summary: string | null
  status: string
  created_at: string
  controversies: Array<{
    controversy_cluster_id: string
    side: string | null
    stance_label: string | null
    question: string | null
    summary: string | null
    status: string | null
  }>
  viewpoints: Array<{
    viewpoint_id: string
    title: string | null
    summary: string
    controversy_cluster_id: string
  }>
  claims: Array<{
    claim_id: string
    role: string | null
    canonical_text: string | null
    story_links: Array<{ story_id: string; url?: string }>
  }>
  topics: Array<{ topic_id: string; title: string; slug: string }>
}

type ControversyDetail = {
  controversy_cluster_id: string
  question: string | null
  summary: string | null
  status: string
  created_at: string
  positions: Array<{
    position_cluster_id: string
    side: string | null
    stance_label: string | null
    label: string | null
    summary: string | null
  }>
  viewpoints: Array<{
    viewpoint_id: string
    title: string | null
    summary: string
    position_cluster_id: string
  }>
  topics: Array<{ topic_id: string; title: string; slug: string; similarity_score: number; rank: number }>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function StatCard({
  label,
  count24h,
  countActive,
}: {
  label: string
  count24h: number
  countActive: number
}) {
  return (
    <div className="rounded-lg border border-subtle bg-muted/20 p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{countActive}</p>
      <p className="text-xs text-muted">+{count24h} in last 24h</p>
    </div>
  )
}

function AdminPositionsPageContent() {
  const searchParams = useSearchParams()
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('positions')
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [controversies, setControversies] = useState<ControversyRow[]>([])
  const [viewpoints, setViewpoints] = useState<ViewpointRow[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  const [selectedControversyId, setSelectedControversyId] = useState<string | null>(null)
  const [selectedViewpointId, setSelectedViewpointId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PositionDetail | ControversyDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const urlTab = searchParams.get('tab') as Tab | null
  const urlId = searchParams.get('id')

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/admin/positions/stats')
      const json = await res.json()
      if (res.ok && json?.data) setStats(json.data)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchList = useCallback(async () => {
    setListLoading(true)
    try {
      if (tab === 'positions') {
        const res = await fetch('/api/admin/positions/list?limit=100')
        const json = await res.json()
        if (res.ok && json?.data?.items) setPositions(json.data.items)
        else setPositions([])
      } else if (tab === 'controversies') {
        const res = await fetch('/api/admin/positions/controversies?limit=100')
        const json = await res.json()
        if (res.ok && json?.data?.items) setControversies(json.data.items)
        else setControversies([])
      } else {
        const res = await fetch('/api/admin/positions/viewpoints?limit=100')
        const json = await res.json()
        if (res.ok && json?.data?.items) setViewpoints(json.data.items)
        else setViewpoints([])
      }
    } finally {
      setListLoading(false)
    }
  }, [tab])

  const fetchDetail = useCallback(async (id: string, type: Tab) => {
    setDetailLoading(true)
    setDetail(null)
    setDetailError(null)
    try {
      if (type === 'positions') {
        const res = await fetch(`/api/admin/positions/${id}`)
        const json = await res.json()
        if (res.ok && json?.data) {
          setDetail(json.data as PositionDetail)
        } else {
          setDetailError(json?.error?.message ?? 'Failed to load position')
        }
      } else if (type === 'controversies') {
        const res = await fetch(`/api/admin/positions/controversies/${id}`)
        const json = await res.json()
        if (res.ok && json?.data) {
          setDetail(json.data as ControversyDetail)
        } else {
          setDetailError(json?.error?.message ?? 'Failed to load controversy')
        }
      } else {
        const vp = viewpoints.find((v) => v.viewpoint_id === id)
        if (vp) {
          setDetail({
            viewpoint_id: vp.viewpoint_id,
            title: vp.title,
            summary: vp.summary,
            controversy_cluster_id: vp.controversy_cluster_id,
            position_cluster_id: vp.position_cluster_id,
            controversy_question: vp.controversy_question,
            position_label: vp.position_label,
          } as unknown as PositionDetail)
        }
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setDetailLoading(false)
    }
  }, [viewpoints])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    if (urlTab && ['positions', 'controversies', 'viewpoints'].includes(urlTab) && urlId) {
      setTab(urlTab)
      if (urlTab === 'positions') setSelectedPositionId(urlId)
      else if (urlTab === 'controversies') setSelectedControversyId(urlId)
      else setSelectedViewpointId(urlId)
    }
  }, [urlTab, urlId])

  useEffect(() => {
    if (selectedPositionId && tab === 'positions') {
      fetchDetail(selectedPositionId, 'positions')
    } else if (selectedControversyId && tab === 'controversies') {
      fetchDetail(selectedControversyId, 'controversies')
    } else if (selectedViewpointId && tab === 'viewpoints') {
      fetchDetail(selectedViewpointId, 'viewpoints')
    } else {
      setDetail(null)
    }
  }, [selectedPositionId, selectedControversyId, selectedViewpointId, tab, fetchDetail])

  const handleSelectPosition = (id: string) => {
    setSelectedPositionId(id)
    setSelectedControversyId(null)
    setSelectedViewpointId(null)
  }
  const handleSelectControversy = (id: string) => {
    setSelectedControversyId(id)
    setSelectedPositionId(null)
    setSelectedViewpointId(null)
  }
  const handleSelectViewpoint = (id: string) => {
    setSelectedViewpointId(id)
    setSelectedPositionId(null)
    setSelectedControversyId(null)
  }
  const clearSelection = () => {
    setSelectedPositionId(null)
    setSelectedControversyId(null)
    setSelectedViewpointId(null)
    setDetail(null)
  }

  const hasSelection =
    selectedPositionId || selectedControversyId || selectedViewpointId

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-content flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            Home
          </Link>
          <span className="text-muted">/</span>
          <Link href="/admin" className="text-sm text-muted hover:text-foreground">
            Admin
          </Link>
          <span className="text-muted">/</span>
          <span className="text-sm font-medium">Positions</span>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">Positions, controversies & viewpoints</h2>
            <p className="text-sm text-muted">
              Browse pipeline output. Click a row to see details and trace to claims, stories, and topics.
            </p>
          </div>

          <Panel variant="soft" interactive={false} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
              {/* Stats row */}
              <div className="md:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {statsLoading ? (
                  <p className="col-span-3 text-sm text-muted">Loading stats…</p>
                ) : stats ? (
                  <>
                    <StatCard
                      label="Positions"
                      count24h={stats.positions_24h}
                      countActive={stats.positions_active}
                    />
                    <StatCard
                      label="Controversies"
                      count24h={stats.controversies_24h}
                      countActive={stats.controversies_active}
                    />
                    <StatCard
                      label="Viewpoints"
                      count24h={stats.viewpoints_24h}
                      countActive={stats.viewpoints_active}
                    />
                  </>
                ) : null}
              </div>

              {/* Tabs */}
              <div className="md:col-span-3 flex items-center gap-2 border-b border-subtle">
                {(['positions', 'controversies', 'viewpoints'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTab(t)
                      clearSelection()
                    }}
                    className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      tab === t
                        ? 'border-foreground text-foreground'
                        : 'border-transparent text-muted hover:text-foreground'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
                {hasSelection && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ml-auto text-xs text-accent-primary hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {/* List + drill-down */}
              <div className="md:col-span-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className={hasSelection ? 'md:col-span-2' : 'md:col-span-3'}>
                  <div className="h-[320px] overflow-y-auto rounded-lg border border-subtle">
                    {listLoading ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted">
                        Loading…
                      </div>
                    ) : tab === 'positions' ? (
                      <PositionsList
                        items={positions}
                        selectedId={selectedPositionId}
                        onSelect={handleSelectPosition}
                      />
                    ) : tab === 'controversies' ? (
                      <ControversiesList
                        items={controversies}
                        selectedId={selectedControversyId}
                        onSelect={handleSelectControversy}
                      />
                    ) : (
                      <ViewpointsList
                        items={viewpoints}
                        selectedId={selectedViewpointId}
                        onSelect={handleSelectViewpoint}
                      />
                    )}
                  </div>
                </div>
                {hasSelection && (
                  <div className="md:col-span-1">
                    <DrillDownPanel
                      tab={tab}
                      detail={detail}
                      loading={detailLoading}
                      error={detailError}
                      onClear={clearSelection}
                    />
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  )
}

function PositionsList({
  items,
  selectedId,
  onSelect,
}: {
  items: PositionRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted">
        No positions found.
      </div>
    )
  }
  return (
    <div className="p-2">
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-subtle bg-background px-1.5 pb-1 pr-[14px] text-xs font-medium text-muted">
        <span>Label</span>
        <span className="flex shrink-0 gap-4">
          <span className="w-10 text-right">Claims</span>
          <span className="w-14 text-right">Controv.</span>
        </span>
      </div>
      <ul className="mt-1 space-y-0.5 pr-2">
        {items.map((p, i) => (
          <li
            key={p.position_cluster_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(p.position_cluster_id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(p.position_cluster_id)}
            className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-sm px-1.5 py-0.5 text-xs hover:bg-muted/50 ${
              i % 2 === 1 ? 'bg-zinc-100 dark:bg-zinc-800/80' : ''
            } ${selectedId === p.position_cluster_id ? 'ring-1 ring-inset ring-accent-primary' : ''}`}
          >
            <span className="min-w-0 flex-1 truncate">
              {p.label || p.summary?.slice(0, 50) || p.position_cluster_id.slice(0, 8)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted">{p.claim_count}</span>
            <span className="w-14 shrink-0 text-right tabular-nums text-muted">{p.controversy_count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ControversiesList({
  items,
  selectedId,
  onSelect,
}: {
  items: ControversyRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted">
        No controversies found.
      </div>
    )
  }
  return (
    <div className="p-2">
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-subtle bg-background px-1.5 pb-1 pr-[14px] text-xs font-medium text-muted">
        <span>Question</span>
        <span className="flex shrink-0 gap-4">
          <span className="w-10 text-right">Pos.</span>
          <span className="w-12 text-right">View.</span>
        </span>
      </div>
      <ul className="mt-1 space-y-0.5 pr-2">
        {items.map((c, i) => (
          <li
            key={c.controversy_cluster_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(c.controversy_cluster_id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(c.controversy_cluster_id)}
            className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-sm px-1.5 py-0.5 text-xs hover:bg-muted/50 ${
              i % 2 === 1 ? 'bg-zinc-100 dark:bg-zinc-800/80' : ''
            } ${selectedId === c.controversy_cluster_id ? 'ring-1 ring-inset ring-accent-primary' : ''}`}
          >
            <span className="min-w-0 flex-1 truncate">
              {c.question || c.summary?.slice(0, 50) || c.controversy_cluster_id.slice(0, 8)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted">{c.position_count}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-muted">{c.viewpoint_count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ViewpointsList({
  items,
  selectedId,
  onSelect,
}: {
  items: ViewpointRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted">
        No viewpoints found.
      </div>
    )
  }
  return (
    <div className="p-2">
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-subtle bg-background px-1.5 pb-1 pr-[14px] text-xs font-medium text-muted">
        <span>Viewpoint / Question</span>
        <span className="w-20 shrink-0 text-right">Position</span>
      </div>
      <ul className="mt-1 space-y-0.5 pr-2">
        {items.map((v, i) => (
          <li
            key={v.viewpoint_id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(v.viewpoint_id)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(v.viewpoint_id)}
            className={`flex cursor-pointer items-baseline justify-between gap-2 rounded-sm px-1.5 py-0.5 text-xs hover:bg-muted/50 ${
              i % 2 === 1 ? 'bg-zinc-100 dark:bg-zinc-800/80' : ''
            } ${selectedId === v.viewpoint_id ? 'ring-1 ring-inset ring-accent-primary' : ''}`}
          >
            <span className="min-w-0 flex-1 truncate">
              {v.title || v.summary?.slice(0, 60) || v.controversy_question?.slice(0, 40) || '—'}
            </span>
            <span className="w-20 shrink-0 truncate text-right text-muted">
              {v.position_label || '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DrillDownPanel({
  tab,
  detail,
  loading,
  error,
  onClear,
}: {
  tab: Tab
  detail: PositionDetail | ControversyDetail | Record<string, unknown> | null
  loading: boolean
  error: string | null
  onClear: () => void
}) {
  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-lg border border-subtle bg-muted/10 text-sm text-muted">
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-subtle bg-muted/10 p-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }
  if (!detail) {
    return null
  }

  if (tab === 'positions' && 'position_cluster_id' in detail) {
    const d = detail as PositionDetail
    return (
      <div className="h-[320px] overflow-y-auto rounded-lg border border-subtle bg-muted/10 p-4">
        <h4 className="text-sm font-medium">Position detail</h4>
        <p className="mt-1 text-xs text-muted">{d.label || 'No label'}</p>
        {d.summary && (
          <p className="mt-2 text-xs text-muted line-clamp-3">{d.summary}</p>
        )}
        <p className="mt-2 text-xs text-muted">Status: {d.status}</p>
        <p className="text-xs text-muted">Created: {formatDate(d.created_at)}</p>

        {(d.controversies ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Controversies</p>
            <ul className="mt-1 space-y-1">
              {(d.controversies ?? []).map((c) => (
                <li key={c.controversy_cluster_id}>
                  <Link
                    href={`/admin/positions?tab=controversies&id=${c.controversy_cluster_id}`}
                    className="text-xs text-accent-primary hover:underline"
                  >
                    {c.question || c.controversy_cluster_id.slice(0, 8)}
                  </Link>
                  {c.stance_label && (
                    <span className="ml-1 text-xs text-muted">({c.stance_label})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(d.viewpoints ?? []).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Viewpoints</p>
            <ul className="mt-1 space-y-1">
              {(d.viewpoints ?? []).map((v) => (
                <li key={v.viewpoint_id}>
                  <Link
                    href="/atlas"
                    className="text-xs text-accent-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {v.title || v.summary?.slice(0, 40) || v.viewpoint_id.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(d.claims ?? []).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Claims ({(d.claims ?? []).length})</p>
            <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
              {(d.claims ?? []).slice(0, 5).map((c) => (
                <li key={c.claim_id} className="text-xs">
                  <span className="line-clamp-2">{c.canonical_text || c.claim_id.slice(0, 8)}</span>
                  {(c.story_links ?? []).length > 0 && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {(c.story_links ?? []).map((s) =>
                        s.url ? (
                          <a
                            key={s.story_id}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-primary hover:underline"
                          >
                            Story
                          </a>
                        ) : (
                          <span key={s.story_id} className="text-muted">
                            {s.story_id.slice(0, 8)}
                          </span>
                        )
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {(d.claims ?? []).length > 5 && (
              <p className="mt-0.5 text-xs text-muted">+{(d.claims ?? []).length - 5} more</p>
            )}
          </div>
        )}

        {(d.topics ?? []).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Topics</p>
            <ul className="mt-1 space-y-0.5">
              {(d.topics ?? []).map((t) => (
                <li key={t.topic_id}>
                  <Link
                    href={`/page/${t.topic_id}`}
                    className="text-xs text-accent-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (tab === 'controversies' && 'controversy_cluster_id' in detail) {
    const d = detail as ControversyDetail
    return (
      <div className="h-[320px] overflow-y-auto rounded-lg border border-subtle bg-muted/10 p-4">
        <h4 className="text-sm font-medium">Controversy detail</h4>
        <p className="mt-1 text-xs text-muted line-clamp-2">{d.question || 'No question'}</p>
        {d.summary && (
          <p className="mt-2 text-xs text-muted line-clamp-3">{d.summary}</p>
        )}
        <p className="mt-2 text-xs text-muted">Status: {d.status}</p>

        {(d.positions ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted">Positions</p>
            <ul className="mt-1 space-y-1">
              {(d.positions ?? []).map((p) => (
                <li key={p.position_cluster_id}>
                  <Link
                    href={`/admin/positions?tab=positions&id=${p.position_cluster_id}`}
                    className="text-xs text-accent-primary hover:underline"
                  >
                    {p.stance_label || p.label || p.position_cluster_id.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(d.viewpoints ?? []).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Viewpoints</p>
            <ul className="mt-1 space-y-0.5">
              {(d.viewpoints ?? []).map((v) => (
                <li key={v.viewpoint_id}>
                  <Link
                    href={`/atlas/viewpoints/${v.viewpoint_id}`}
                    className="text-xs text-accent-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {v.title || v.summary?.slice(0, 40)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(d.topics ?? []).length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Topics</p>
            <ul className="mt-1 space-y-0.5">
              {(d.topics ?? []).map((t) => (
                <li key={t.topic_id}>
                  <Link
                    href={`/page/${t.topic_id}`}
                    className="text-xs text-accent-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  if (tab === 'viewpoints' && 'viewpoint_id' in detail) {
    const d = detail as {
      viewpoint_id: string
      title: string | null
      summary: string
      controversy_cluster_id: string
      position_cluster_id: string
      controversy_question?: string | null
      position_label?: string | null
    }
    return (
      <div className="h-[320px] overflow-y-auto rounded-lg border border-subtle bg-muted/10 p-4">
        <h4 className="text-sm font-medium">Viewpoint detail</h4>
        <p className="mt-1 text-xs text-muted">{d.title || 'No title'}</p>
        <p className="mt-2 text-xs text-muted line-clamp-4">{d.summary}</p>
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted">Controversy</p>
          <Link
            href={`/admin/positions?tab=controversies&id=${d.controversy_cluster_id}`}
            className="block text-xs text-accent-primary hover:underline"
          >
            {d.controversy_question || d.controversy_cluster_id.slice(0, 8)}
          </Link>
          <p className="text-xs font-medium text-muted">Position</p>
          <Link
            href={`/admin/positions?tab=positions&id=${d.position_cluster_id}`}
            className="block text-xs text-accent-primary hover:underline"
          >
            {d.position_label || d.position_cluster_id.slice(0, 8)}
          </Link>
          <Link
            href="/atlas"
            className="mt-2 block text-xs text-accent-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Atlas
          </Link>
        </div>
      </div>
    )
  }

  return null
}

export default function AdminPositionsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen px-4 pb-16 pt-6 text-foreground sm:px-6 md:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-content flex-col gap-8">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </main>
    }>
      <AdminPositionsPageContent />
    </Suspense>
  )
}
