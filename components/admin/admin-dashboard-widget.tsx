'use client'

import Link from 'next/link'
import CountUp from 'react-countup'
import { cn } from '@/lib/utils'

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

type HealthMetric = {
  label: string
  value: string | number
  href?: string
}

/** Ease-out quint — fast start, strong decelerating stop. */
function easeOutQuint(t: number, b: number, c: number, d: number): number {
  return c * (Math.pow(t / d - 1, 5) + 1) + b
}

function parseMetricValue(value: string | number): {
  end: number
  suffix: string
  prefix: string
  decimals: number
} {
  if (typeof value === 'number') {
    return {
      end: value,
      suffix: '',
      prefix: '',
      decimals: Number.isInteger(value) ? 0 : 1,
    }
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^([^0-9+\-]*)([+-]?\d+(?:\.\d+)?)(.*)$/)
  if (!match) {
    return { end: 0, suffix: trimmed, prefix: '', decimals: 0 }
  }

  const [, prefix, num, suffix] = match
  const end = Number(num)
  return {
    end: Number.isFinite(end) ? end : 0,
    prefix,
    suffix,
    decimals: num.includes('.') ? Math.min(num.split('.')[1]?.length ?? 0, 2) : 0,
  }
}

function HealthMetricValue({ value }: { value: string | number }) {
  const { end, prefix, suffix, decimals } = parseMetricValue(value)

  if (!Number.isFinite(end) && suffix && !prefix) {
    return <>{value}</>
  }

  return (
    <CountUp
      start={0}
      end={end}
      duration={1.6}
      delay={0.05}
      prefix={prefix}
      suffix={suffix}
      decimals={decimals}
      separator=","
      useEasing
      easingFn={easeOutQuint}
    />
  )
}

export function AdminHealthStatsMarquee({
  metrics,
  className,
}: {
  metrics: HealthMetric[]
  className?: string
}) {
  const loop = metrics.length > 0 ? [...metrics, ...metrics] : []
  const ariaLabel = metrics
    .map((metric) => `${metric.value} ${metric.label}`)
    .join(', ')

  if (metrics.length === 0) return null

  return (
    <div
      className={cn('relative min-w-0 flex-1 overflow-hidden', className)}
      aria-label={ariaLabel || 'Health metrics'}
    >
      <div
        className={cn(
          'flex w-max items-stretch gap-8',
          'animate-stats-marquee-x hover:[animation-play-state:paused]',
          'motion-reduce:animate-none motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:gap-x-6 motion-reduce:gap-y-3'
        )}
      >
        {loop.map((metric, index) => {
          const cell = (
            <>
              <p className="text-xl font-semibold tabular-nums leading-none">
                <HealthMetricValue value={metric.value} />
              </p>
              <p className="mt-1 whitespace-nowrap text-[11px] leading-snug text-muted">
                {metric.label}
              </p>
            </>
          )

          if (metric.href) {
            return (
              <Link
                key={`${metric.label}-${index}`}
                href={metric.href}
                className="shrink-0 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
              >
                {cell}
              </Link>
            )
          }

          return (
            <div key={`${metric.label}-${index}`} className="shrink-0 px-1 py-0.5">
              {cell}
            </div>
          )
        })}
      </div>
    </div>
  )
}

