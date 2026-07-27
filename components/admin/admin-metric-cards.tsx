'use client'

import { useEffect, useRef, useState } from 'react'
import { AdminHealthStatsMarquee } from '@/components/admin/admin-dashboard-widget'
import { MetricCard, formatMetricCount } from '@/components/admin/metric-card'
import { MetricCardEditDialog } from '@/components/admin/metric-card-edit-dialog'
import {
  CHART_SLOT_IDS,
  type ChartCatalogId,
  type ChartSlotId,
  type DashboardChartPrefs,
  DEFAULT_CHART_TITLES,
  DEFAULT_DASHBOARD_CHART_PREFS,
  loadDashboardChartPrefs,
  saveDashboardChartPrefs,
} from '@/lib/admin/dashboard-chart-catalog'
import { cn } from '@/lib/utils'

const SLOT_SWAP_MS = 1200
/** Match MetricCard spinner fade so the swap loading overlay eases out. */
const SLOT_SWAP_OUTRO_MS = 400

type SlotSwapAnim = {
  slotId: ChartSlotId
  fromId: ChartCatalogId
  toId: ChartCatalogId
  phase: 'crossfade' | 'outro'
}

const RANGES = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
] as const

type MetricRange = (typeof RANGES)[number]['id']

type DashboardMetrics = {
  range: MetricRange
  windowDays: number
  stories: {
    total: number
    cumulative: number[]
    daily: number[]
    days: string[]
    changePct: number
    cumulativeChangePct: number
    periodIngest: number
  }
  scrape: {
    successRateSeries: number[]
    days: string[]
    latestRate: number
    successRate: number
    failureRate: number
    attemptCount: number
    changePts: number
  }
  qa: {
    pending: number
  }
  relevance: {
    keepCount: number
    keepRate: number
    totalClassified: number
  }
}

type SlotEditState = {
  slotId: ChartSlotId
  chartId: ChartCatalogId
}

function formatSigned(n: number, suffix = '%'): string {
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}${suffix}`
}

function formatRatePct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const rounded = Math.round(n * 10) / 10
  return `${rounded}%`
}

function scrapeRateBadge(successRate: number, attemptCount: number): string {
  if (attemptCount <= 0) return 'No data'
  if (successRate >= 95) return 'Good'
  if (successRate >= 85) return 'Fair'
  return 'Poor'
}

function rangeLabel(range: MetricRange, windowDays: number): string {
  const map: Record<MetricRange, string> = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '3m': 'Last 3 months',
    '6m': 'Last 6 months',
    '1y': 'Last year',
  }
  return map[range] ?? `Last ${windowDays} days`
}

type ChartBuildCtx = {
  data: DashboardMetrics | null
  loading: boolean
  windowCopy: string
  title: string
  onOpen?: () => void
}

function buildChartProps(id: ChartCatalogId, ctx: ChartBuildCtx) {
  const { data, loading, windowCopy, title, onOpen } = ctx
  const shared = {
    title,
    loading,
    onOpen,
    className: 'border-border/50 shadow-none',
  }

  switch (id) {
    case 'stories':
      return {
        ...shared,
        subtitle: `${windowCopy} · cumulative`,
        value: formatMetricCount(data?.stories.total ?? 0),
        change: formatSigned(data?.stories.cumulativeChangePct ?? 0),
        chart: 'area' as const,
        data: data?.stories.cumulative,
        labels: data?.stories.days,
        tooltipLabel: 'Stories',
      }
    case 'daily_ingest':
      return {
        ...shared,
        subtitle: `${windowCopy} · new / day`,
        value: formatMetricCount(data?.stories.periodIngest ?? 0),
        change: formatSigned(data?.stories.changePct ?? 0),
        chart: 'bars' as const,
        data: data?.stories.daily,
        labels: data?.stories.days,
        tooltipLabel: 'Ingest',
      }
    case 'scrape_rate':
      return {
        ...shared,
        subtitle: windowCopy,
        value:
          data && data.scrape.attemptCount > 0
            ? formatRatePct(data.scrape.successRate)
            : '—',
        change:
          data && data.scrape.attemptCount > 0
            ? formatSigned(data.scrape.changePts, ' pts')
            : '—',
        chart: 'rate' as const,
        donutValue:
          data && data.scrape.attemptCount > 0 ? data.scrape.successRate : 0,
        centerValue:
          data && data.scrape.attemptCount > 0
            ? formatRatePct(Math.round(data.scrape.successRate))
            : '—',
        ratePrimary: {
          label: 'Successful',
          value:
            data && data.scrape.attemptCount > 0
              ? formatRatePct(data.scrape.successRate)
              : '—',
        },
        rateSecondary: {
          label: 'Failed',
          value:
            data && data.scrape.attemptCount > 0
              ? formatRatePct(data.scrape.failureRate)
              : '—',
        },
        badge: data
          ? scrapeRateBadge(data.scrape.successRate, data.scrape.attemptCount)
          : undefined,
      }
    case 'qa_backlog':
      return {
        ...shared,
        subtitle: 'Current · needs human review',
        value: formatMetricCount(data?.qa.pending ?? 0),
        change: data ? `${data.relevance.keepRate}% KEEP` : '—',
        chart: 'donut' as const,
        donutValue: data?.relevance.keepRate,
        centerValue: formatMetricCount(data?.qa.pending ?? 0),
        centerLabel: 'Pending',
      }
  }
}

export function AdminMetricCards({
  className,
  healthMetrics = [],
}: {
  className?: string
  healthMetrics?: { label: string; value: string | number; href?: string }[]
}) {
  const [range, setRange] = useState<MetricRange>('30d')
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  const [prefs, setPrefs] = useState<DashboardChartPrefs>(() => ({
    titles: { ...DEFAULT_DASHBOARD_CHART_PREFS.titles },
    slots: { ...DEFAULT_DASHBOARD_CHART_PREFS.slots },
  }))
  /** Lagging slot map so the outgoing chart stays mounted through the fade. */
  const [displaySlots, setDisplaySlots] = useState<
    DashboardChartPrefs['slots']
  >(() => ({ ...DEFAULT_DASHBOARD_CHART_PREFS.slots }))
  const [edit, setEdit] = useState<SlotEditState | null>(null)
  const [swapAnim, setSwapAnim] = useState<SlotSwapAnim | null>(null)
  const swapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const loaded = loadDashboardChartPrefs()
    setPrefs(loaded)
    setDisplaySlots({ ...loaded.slots })
  }, [])

  useEffect(() => {
    return () => {
      if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin/dashboard-metrics?range=${range}`)
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error?.message ?? 'Failed to load metrics')
        }
        if (!cancelled) {
          setData(json.data as DashboardMetrics)
          hasLoadedRef.current = true
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics')
          if (!hasLoadedRef.current) setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [range])

  const windowCopy = data
    ? rangeLabel(data.range, data.windowDays)
    : rangeLabel(range, 30)

  const persistPrefs = (next: DashboardChartPrefs) => {
    setPrefs(next)
    saveDashboardChartPrefs(next)
  }

  return (
    <div className={cn('flex flex-col overflow-visible', className)}>
      <div className="mb-8 flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Key Metrics
        </h2>
        <div
          role="group"
          aria-label="Time range"
          className="flex shrink-0 items-center rounded-md border border-border/70 bg-surface-section p-0.5"
        >
          {RANGES.map((item) => {
            const active = range === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id)}
                aria-pressed={active}
                className={cn(
                  'rounded px-2 py-1 text-[11px] tabular-nums transition-colors',
                  active
                    ? 'bg-[var(--accent-primary-soft)] font-bold text-accent-primary shadow-sm'
                    : 'font-medium text-muted hover:text-foreground'
                )}
                style={active ? { fontWeight: 700 } : undefined}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-8 w-full min-w-0">
        <AdminHealthStatsMarquee metrics={healthMetrics} />
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CHART_SLOT_IDS.map((slotId) => {
          const displayId = displaySlots[slotId]
          const swapping =
            swapAnim?.slotId === slotId ? swapAnim : null
          const title =
            prefs.titles[displayId] || DEFAULT_CHART_TITLES[displayId]

          return (
            <div
              key={slotId}
              className="relative min-h-[240px]"
              aria-live={swapping ? 'polite' : undefined}
            >
              <div
                className={cn(
                  swapping?.phase === 'crossfade' &&
                    'pointer-events-none animate-metric-swap-out'
                )}
              >
                <MetricCard
                  key={displayId}
                  {...buildChartProps(displayId, {
                    data,
                    loading,
                    windowCopy,
                    title,
                    onOpen: swapping
                      ? undefined
                      : () => setEdit({ slotId, chartId: displayId }),
                  })}
                />
              </div>
              {swapping ? (
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 z-10',
                    swapping.phase === 'crossfade' && 'animate-metric-swap-in',
                    swapping.phase === 'outro' && 'animate-metric-swap-out-fast'
                  )}
                >
                  <MetricCard
                    {...buildChartProps(swapping.toId, {
                      data,
                      loading: true,
                      windowCopy,
                      title:
                        prefs.titles[swapping.toId] ||
                        DEFAULT_CHART_TITLES[swapping.toId],
                      onOpen: undefined,
                    })}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {edit ? (
        <MetricCardEditDialog
          open
          onOpenChange={(open) => {
            if (!open) setEdit(null)
          }}
          chartId={edit.chartId}
          title={prefs.titles[edit.chartId] || DEFAULT_CHART_TITLES[edit.chartId]}
          titles={prefs.titles}
          onSaveTitle={(nextTitle) => {
            persistPrefs({
              ...prefs,
              titles: {
                ...prefs.titles,
                [edit.chartId]: nextTitle,
              },
            })
          }}
          onSwap={(pickedId) => {
            const fromId = edit.chartId
            const slotId = edit.slotId
            if (pickedId === fromId) return

            persistPrefs({
              ...prefs,
              slots: {
                ...prefs.slots,
                [slotId]: pickedId,
              },
            })

            const reduced =
              typeof window !== 'undefined' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches

            if (reduced) {
              setDisplaySlots((prev) => ({ ...prev, [slotId]: pickedId }))
              return
            }

            if (swapTimerRef.current) clearTimeout(swapTimerRef.current)
            setSwapAnim({ slotId, fromId, toId: pickedId, phase: 'crossfade' })
            swapTimerRef.current = setTimeout(() => {
              setDisplaySlots((prev) => ({ ...prev, [slotId]: pickedId }))
              setSwapAnim({
                slotId,
                fromId,
                toId: pickedId,
                phase: 'outro',
              })
              swapTimerRef.current = setTimeout(() => {
                setSwapAnim(null)
                swapTimerRef.current = null
              }, SLOT_SWAP_OUTRO_MS)
            }, SLOT_SWAP_MS)
          }}
        />
      ) : null}
    </div>
  )
}
