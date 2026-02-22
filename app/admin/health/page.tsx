'use client'

import { AlertTriangle, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis } from 'recharts'
import { Panel } from '@/components/Panel'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ScrapeDay = { day: string; success: number; failure: number }

const areaChartConfig = {
  success: {
    label: 'Success',
    color: 'var(--primary)',
  },
  failure: {
    label: 'Failure',
    color: 'var(--accent-secondary)',
  },
} satisfies ChartConfig

type TimeRange = '1h' | '24h' | '7d'

function formatHour(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatHourTooltip(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Shorter axis labels to prevent overlap. Varies by range. */
function formatAxisTick(isoDate: string, timeRange: TimeRange): string {
  const d = new Date(isoDate)
  if (timeRange === '1h') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  if (timeRange === '24h') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', hour12: true })
}

function createDrillDownTooltip() {
  return function DrillDownTooltip(props: { active?: boolean; payload?: Array<{ payload?: ScrapeDay }>; label?: string }) {
    if (!props.active || !props.payload?.length) return null
    const p = props.payload[0]?.payload
    if (!p) return null
    return (
      <div className="border-border/50 bg-background min-w-[8rem] rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
        <ChartTooltipContent
          {...props}
          labelFormatter={(v: string | number | undefined) => formatHourTooltip(String(v ?? ''))}
          indicator="dot"
        />
      </div>
    )
  }
}

function ScrapeAreaChart({
  timeRange,
  onTimeRangeChange,
  onBucketSelect,
  selectedBucket,
  onClearSelection,
}: {
  timeRange: TimeRange
  onTimeRangeChange: (v: TimeRange) => void
  onBucketSelect: (bucket: string, timeRange: TimeRange, outcome?: 'failure' | 'success') => void
  selectedBucket: string | null
  onClearSelection: () => void
}) {
  const [chartData, setChartData] = useState<ScrapeDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/health/scrape-stats?range=${timeRange}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        const raw = (json?.data ?? []) as { day: string; success: number; failure: number }[]
        setChartData(raw.map((r) => ({ day: r.day, success: r.success, failure: r.failure })))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [timeRange])

  const isLoading = loading
  const hasData = chartData.length > 0
  const showEmpty = !isLoading && !hasData

  // Animate only on initial load; skip animation when user adds reference line etc.
  const [hasAnimated, setHasAnimated] = useState(false)
  useEffect(() => {
    if (!hasData) return
    const t = setTimeout(() => setHasAnimated(true), 800)
    return () => clearTimeout(t)
  }, [hasData])

  return (
    <div className="pt-0">
      <div className="flex flex-col gap-2 border-b border-subtle py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 px-4 sm:px-6">
          <h3 className="font-semibold">Scrapes over time</h3>
          <p className="text-sm text-muted">
            Success and failure counts
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 sm:px-6 sm:ml-auto">
          {selectedBucket && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-xs text-accent-primary hover:underline"
            >
              Clear selection
            </button>
          )}
          <Select value={timeRange} onValueChange={(v) => onTimeRangeChange(v as TimeRange)}>
            <SelectTrigger
              className="w-[160px] rounded-lg"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 7 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="1h" className="rounded-lg">
                Last hour
              </SelectItem>
              <SelectItem value="24h" className="rounded-lg">
                Last 24 hours
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6 pb-4">
        {isLoading ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : showEmpty ? (
          <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed border-subtle bg-muted/20">
            <p className="text-sm text-muted">No scrape data in this time range</p>
          </div>
        ) : (
          <ChartContainer
            config={areaChartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart
              data={chartData}
              accessibilityLayer
              onClick={(state) => {
                const payload = state?.activePayload
                const p = payload?.[0]?.payload as ScrapeDay | undefined
                if (p && (p.failure > 0 || p.success > 0)) {
                  const outcome = p.failure > 0 ? 'failure' : 'success'
                  onBucketSelect(p.day, timeRange, outcome)
                }
              }}
            >
              <defs>
                <linearGradient id="fillSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-success)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-success)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillFailure" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-failure)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-failure)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              {selectedBucket && (
                <ReferenceLine
                  x={selectedBucket}
                  stroke="var(--muted)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  isFront
                />
              )}
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatAxisTick(value, timeRange)}
              />
              <ChartTooltip
                cursor={false}
                content={createDrillDownTooltip()}
              />
              <Area
                dataKey="failure"
                type="natural"
                fill="url(#fillFailure)"
                stroke="var(--color-failure)"
                stackId="a"
                isAnimationActive={!hasAnimated}
              />
              <Area
                dataKey="success"
                type="natural"
                fill="url(#fillSuccess)"
                stroke="var(--color-success)"
                stackId="a"
                isAnimationActive={!hasAnimated}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}

type DrilldownRow = { domain: string; storyId: string; title: string; url: string; error: string | null; createdAt: string }

type DrilldownOutcome = 'failure' | 'success'

function ScrapeDrillDownPanel({
  selectedBucket,
  timeRange,
  outcome,
  onToggleOutcome,
}: {
  selectedBucket: string | null
  timeRange: TimeRange
  outcome: DrilldownOutcome
  onToggleOutcome: () => void
}) {
  const [data, setData] = useState<DrilldownRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedBucket) {
      setData([])
      return
    }
    let cancelled = false
    setLoading(true)
    const granularity = timeRange === '1h' ? '5min' : 'hour'
    fetch(`/api/admin/health/scrape-drilldown?bucket=${encodeURIComponent(selectedBucket)}&granularity=${granularity}&outcome=${outcome}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        setData((json?.data ?? []) as DrilldownRow[])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedBucket, timeRange, outcome])

  // Nested: domain -> story title -> { count, url, errors }
  const nested = data.reduce<
    Record<string, Record<string, { count: number; url: string; errors: string[] }>>
  >((acc, row) => {
    const d = row.domain
    if (!acc[d]) acc[d] = {}
    const byTitle = acc[d]
    const key = row.title || row.storyId
    if (!byTitle[key]) {
      byTitle[key] = { count: 0, url: row.url, errors: [] }
    }
    byTitle[key].count += 1
    if (row.error && !byTitle[key].errors.includes(row.error)) {
      byTitle[key].errors.push(row.error)
    }
    return acc
  }, {})

  // For successes, tooltip shows nothing (no error). We still show the structure.
  const countLabel = outcome === 'failure' ? 'Failures' : 'Successes'
  const isSuccess = outcome === 'success'

  if (!selectedBucket) {
    return (
      <div className="flex h-[280px] flex-col p-4">
        <h4 className="text-sm font-medium">Scrapes by source</h4>
        <p className="mt-2 flex flex-1 items-center text-sm text-muted">
          Click a timepoint on the chart above to see details.
        </p>
      </div>
    )
  }

  const bucketLabel = formatHourTooltip(selectedBucket)

  return (
    <div className="flex h-[280px] flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          {isSuccess ? 'Successful' : 'Failed'} scrapes — {bucketLabel}
        </h4>
        <button
          type="button"
          onClick={onToggleOutcome}
          className="text-xs text-accent-primary hover:underline"
        >
          See {isSuccess ? 'failures' : 'successes'}
        </button>
      </div>
      {loading ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : data.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No {isSuccess ? 'successful' : 'failed'} scrapes in this time bucket.
        </p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="mt-2 flex flex-col">
            <div className="h-[200px] overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-subtle bg-background px-1.5 pb-1 pr-[14px] text-xs font-medium text-muted">
                <span>Domain, Story</span>
                <span className="w-14 shrink-0 text-right">{countLabel}</span>
              </div>
              <div className="mt-1 space-y-0.5 pr-2">
            {Object.entries(nested).map(([domain, byTitle], domainIndex) => {
              const domainTotal = Object.values(byTitle).reduce((sum, info) => sum + info.count, 0)
              return (
              <Collapsible key={domain} className="group">
                <CollapsibleTrigger
                  className={`flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-0.5 text-left text-xs font-medium text-muted hover:bg-muted/50 hover:text-foreground ${domainIndex % 2 === 1 ? 'bg-zinc-100 dark:bg-zinc-800/80' : ''}`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <ChevronDown className="size-3 shrink-0 transition-transform group-data-[state=closed]:-rotate-90" />
                    {domain}
                  </span>
                  <span className="w-14 shrink-0 text-right tabular-nums">{domainTotal}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-subtle pl-3">
                    {Object.entries(byTitle).map(([title, info], storyIndex) => (
                      <li
                        key={title}
                        className={`flex items-baseline justify-between gap-2 px-1.5 py-0.5 text-xs rounded-sm ${storyIndex % 2 === 1 ? 'bg-zinc-100 dark:bg-zinc-800/80' : ''}`}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={info.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-accent-primary hover:underline"
                            >
                              {title}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-[280px] whitespace-pre-wrap text-left"
                          >
                            {info.errors.length > 0 ? (
                              info.errors.join('\n\n')
                            ) : (
                              <span className="text-muted-foreground">
                                {isSuccess ? 'Scraped successfully' : 'No error message'}
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                        <span className="w-14 shrink-0 text-right tabular-nums text-muted">
                          {info.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )})}
              </div>
            </div>
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}

type DomainScrapeStats = { domain: string; total: number; successes: number; failures: number }

function DomainScrapeRateList() {
  const [data, setData] = useState<DomainScrapeStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/admin/health/scrape-stats-by-source')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json) return
        const raw = (json?.data ?? []) as DomainScrapeStats[]
        raw.sort((a, b) => {
          const rateA = a.total > 0 ? (a.successes / a.total) * 100 : 0
          const rateB = b.total > 0 ? (b.successes / b.total) * 100 : 0
          return rateA - rateB
        })
        setData(raw)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Scrape rate by domain (24h)</h4>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Scrape rate by domain (24h)</h4>
        <p className="text-sm text-muted">No scrape data in the last 24 hours.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Scrape rate by domain (24h)</h4>
      <div className="h-[240px] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-subtle bg-background px-1.5 pb-1 pr-[14px] text-xs font-medium text-muted">
          <span>Domain</span>
          <span className="w-14 shrink-0 text-right">Rate</span>
        </div>
        <ul className="mt-1 space-y-0.5 pr-2">
          {data.map(({ domain, total, successes }) => {
            const rate = total > 0 ? Math.round((successes / total) * 100) : 0
            return (
            <li
              key={domain}
              className="flex items-center justify-between gap-2 px-1.5 py-0.5 text-xs rounded-sm even:bg-zinc-100 dark:even:bg-zinc-800/80"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                {rate < 80 && (
                  <AlertTriangle
                    className="size-3.5 shrink-0 text-amber-500"
                    aria-label="Low scrape rate"
                  />
                )}
                {domain}
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted">
                {total > 0 ? `${rate}%` : '—'}
              </span>
            </li>
          )})}
        </ul>
      </div>
    </div>
  )
}

export default function AdminHealthPage() {
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [drilldownOutcome, setDrilldownOutcome] = useState<'failure' | 'success'>('failure')

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
          <span className="text-sm font-medium">Health</span>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="mb-1 text-lg font-semibold">Data health</h2>
            <p className="text-sm text-muted">
              Monitor pipeline status, data quality, and overall health.
            </p>
          </div>

          <Panel variant="soft" interactive={false} className="overflow-hidden">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 p-4">
                {/* Full-width interactive area chart */}
                <div className="md:col-span-3">
                  <ScrapeAreaChart
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                    onBucketSelect={(bucket, _t, outcome) => {
                      setSelectedBucket(bucket)
                      if (outcome) setDrilldownOutcome(outcome)
                    }}
                    selectedBucket={selectedBucket}
                    onClearSelection={() => setSelectedBucket(null)}
                  />
                </div>
                {/* Scrapes by source (2 cols) + scrape rate by domain (1 col) */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <ScrapeDrillDownPanel
                      selectedBucket={selectedBucket}
                      timeRange={timeRange}
                      outcome={drilldownOutcome}
                      onToggleOutcome={() => setDrilldownOutcome((o) => (o === 'failure' ? 'success' : 'failure'))}
                    />
                  </div>
                  <div className="p-4">
                    <DomainScrapeRateList />
                  </div>
                </div>
              </div>
            </Panel>
        </div>
      </div>
    </main>
  )
}
