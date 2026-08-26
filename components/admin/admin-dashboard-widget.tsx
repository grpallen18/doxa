'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { KpiMetricValue } from '@/components/admin/kpi-slot-value'
import { Button } from '@/components/ui/button'
import type {
  AdminHealthMetric,
  AdminHealthMetricSection,
} from '@/lib/admin/admin-health-metrics'
import { cn } from '@/lib/utils'

const HEALTH_STATS_MAX_ROWS = 3
/** Matches `minmax(9rem, 1fr)` in the health stats grid. */
const HEALTH_STATS_MIN_COL_PX = 144
/** Matches Tailwind `gap-8` (2rem). */
const HEALTH_STATS_COL_GAP_PX = 32

function computeHealthStatsColumns(containerWidth: number): number {
  if (containerWidth <= 0) return 1
  return Math.max(
    1,
    Math.floor(
      (containerWidth + HEALTH_STATS_COL_GAP_PX) /
        (HEALTH_STATS_MIN_COL_PX + HEALTH_STATS_COL_GAP_PX)
    )
  )
}

type AdminDashboardWidgetProps = {
  title?: string
  titleClassName?: string
  headerCenter?: React.ReactNode
  headerAside?: React.ReactNode
  href?: string
  className?: string
  children: React.ReactNode
}

export function AdminDashboardWidget({
  title,
  titleClassName,
  headerCenter,
  headerAside,
  href,
  className,
  children,
}: AdminDashboardWidgetProps) {
  const body = (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm',
        href && 'transition-[box-shadow,border-color] hover:border-border hover:shadow-md',
        className
      )}
    >
      {title ? (
        <div className="grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/60 px-4">
          <p
            className={cn(
              'flex items-center justify-self-start text-xs font-semibold tracking-tight text-foreground',
              titleClassName
            )}
          >
            {title}
          </p>
          <div className="flex items-center justify-self-center">{headerCenter}</div>
          <div className="flex items-center justify-self-end gap-3">
            {headerAside}
            {href ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Open
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn('flex flex-1 flex-col', title && 'p-4')}>{children}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    )
  }

  return body
}

type HealthMetric = AdminHealthMetric

function HealthMetricValue({ value }: { value: string | number }) {
  return <KpiMetricValue value={value} />
}

function HealthMetricCell({ metric }: { metric: HealthMetric }) {
  const cell = (
    <>
      <div className="text-xl font-semibold tabular-nums leading-none">
        <HealthMetricValue value={metric.value} />
      </div>
      <p className="mt-1 whitespace-nowrap text-[11px] leading-snug text-muted">
        {metric.label}
      </p>
    </>
  )

  if (metric.href) {
    return (
      <Link
        href={metric.href}
        className="rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
      >
        {cell}
      </Link>
    )
  }

  return <div className="px-1 py-0.5">{cell}</div>
}

export function AdminHealthStatsGrid({
  metrics,
  className,
}: {
  metrics: HealthMetric[]
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** null until measured — avoids SSR/hydration flash at columns=1 (vertical + pagination). */
  const [columns, setColumns] = useState<number | null>(null)
  const [page, setPage] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateColumns = () => {
      const next = computeHealthStatsColumns(el.clientWidth)
      setColumns(next)
    }

    updateColumns()
    const ro = new ResizeObserver(updateColumns)
    ro.observe(el)
    return () => ro.disconnect()
  }, [metrics.length])

  const measured = columns != null
  const itemsPerPage = measured ? columns * HEALTH_STATS_MAX_ROWS : metrics.length
  const pageCount = Math.max(1, Math.ceil(metrics.length / Math.max(itemsPerPage, 1)))
  const needsPagination = measured && metrics.length > itemsPerPage
  const safePage = Math.min(page, pageCount - 1)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  useEffect(() => {
    setPage(0)
  }, [columns, metrics.length])

  if (metrics.length === 0) return null

  const visibleMetrics = needsPagination
    ? metrics.slice(
        safePage * itemsPerPage,
        safePage * itemsPerPage + itemsPerPage
      )
    : metrics

  const ariaLabel = metrics
    .map((metric) => `${metric.value} ${metric.label}`)
    .join(', ')

  return (
    <div
      ref={containerRef}
      className={cn('relative min-w-0 flex-1', className)}
      aria-label={ariaLabel || 'Health metrics'}
    >
      <div
        className="grid gap-x-8 gap-y-3"
        style={{
          gridTemplateColumns: measured
            ? `repeat(${columns}, minmax(0, 1fr))`
            : `repeat(auto-fill, minmax(${HEALTH_STATS_MIN_COL_PX}px, 1fr))`,
        }}
      >
        {visibleMetrics.map((metric) => (
          <HealthMetricCell key={metric.id} metric={metric} />
        ))}
      </div>

      {needsPagination ? (
        <nav
          aria-label="Health metrics pages"
          className="mt-4 flex items-center justify-center gap-3"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Previous metrics page"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Next metrics page"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}

export function AdminHealthStatsSections({
  sections,
  className,
}: {
  sections: AdminHealthMetricSection[]
  className?: string
}) {
  const visibleSections = sections.filter((section) => section.metrics.length > 0)
  if (visibleSections.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {visibleSections.map((section) => (
        <div key={section.id} className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {section.title}
          </h3>
          <AdminHealthStatsGrid metrics={section.metrics} />
        </div>
      ))}
    </div>
  )
}

/** Mid-level KPI group (e.g. Over Time / As Of Now) with subsection grids. */
export function AdminHealthStatsGroup({
  title,
  sections,
  headerAside,
  className,
}: {
  title: string
  sections: AdminHealthMetricSection[]
  headerAside?: React.ReactNode
  className?: string
}) {
  const visibleSections = sections.filter((section) => section.metrics.length > 0)
  if (visibleSections.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {headerAside}
      </div>
      <AdminHealthStatsSections sections={visibleSections} />
    </div>
  )
}

