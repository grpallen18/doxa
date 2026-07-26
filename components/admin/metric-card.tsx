'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

type ChartKind = 'bars' | 'area' | 'line' | 'step' | 'donut' | 'rate'

export type MetricRateRow = {
  label: string
  value: string
}

export type MetricCardProps = {
  title: string
  subtitle: string
  value: string
  change: string
  chart: ChartKind
  data?: number[]
  /** Point labels (e.g. dates) aligned with `data` */
  labels?: string[]
  /** Short series name shown in the scrub tooltip */
  tooltipLabel?: string
  /** Formats the hovered numeric value in the tooltip */
  formatPoint?: (value: number) => string
  donutValue?: number
  centerValue?: string
  centerLabel?: string
  /** Left-column primary row for `rate` charts (e.g. Successful) */
  ratePrimary?: MetricRateRow
  /** Left-column secondary row for `rate` charts (e.g. Failed) */
  rateSecondary?: MetricRateRow
  /** Optional pill badge in the rate-card header */
  badge?: string
  className?: string
  /** When set (and `onOpen` is not), the whole card is a link. */
  href?: string
  /** When set, click opens the edit dialog instead of navigating. */
  onOpen?: () => void
  loading?: boolean
}

type Point = { x: number; y: number; value: number }

type HoverState = {
  index: number
  point: Point
  label: string
  /** Pointer x within chart container (px) */
  pointerX: number
  /** Target y for tooltip (px, within container) */
  targetY: number
  /** Prefer tooltip on the right of the cursor when true */
  tipOnRight: boolean
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max)
}

const CHART_REVEAL_MS = 2400
const CHART_REVEAL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Pause after spinner clears before chart draw / fade-in animations start. */
const CHART_DRAW_BUFFER_MS = 400
/** Match dashboard swap crossfade (`metric-swap-in` / SLOT_SWAP_MS). */
const SPINNER_FADE_IN_MS = 1200
/** Match dashboard swap outro (`metric-swap-out-fast` / SLOT_SWAP_OUTRO_MS). */
const SPINNER_FADE_OUT_MS = 400

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Spinner fade in/out + post-spinner blank buffer before chart draw.
 * Fade durations mirror chart-swap overlay timing so hard reload matches swap.
 * If data arrives before fade-in finishes, fade-out waits until fade-in completes.
 */
function useMetricCardPhases(loading: boolean) {
  const [spinnerMounted, setSpinnerMounted] = useState(loading)
  const [spinnerOpaque, setSpinnerOpaque] = useState(false)
  const [fadeMs, setFadeMs] = useState(SPINNER_FADE_IN_MS)
  const [drawReady, setDrawReady] = useState(false)
  const spinnerMountedRef = useRef(loading)
  const spinnerOpaqueRef = useRef(false)
  const fadeInCompleteAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []
    let rafOuter = 0
    let rafInner = 0

    const setOpaque = (value: boolean) => {
      spinnerOpaqueRef.current = value
      setSpinnerOpaque(value)
    }

    if (loading) {
      setDrawReady(false)
      spinnerMountedRef.current = true
      setSpinnerMounted(true)
      setFadeMs(SPINNER_FADE_IN_MS)
      // Provisional end time; refined when the opacity transition actually starts.
      fadeInCompleteAtRef.current = performance.now() + SPINNER_FADE_IN_MS

      if (prefersReducedMotion()) {
        setOpaque(true)
        fadeInCompleteAtRef.current = performance.now()
        return
      }

      setOpaque(false)
      rafOuter = requestAnimationFrame(() => {
        rafInner = requestAnimationFrame(() => {
          if (cancelled) return
          setOpaque(true)
          fadeInCompleteAtRef.current = performance.now() + SPINNER_FADE_IN_MS
        })
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(rafOuter)
        cancelAnimationFrame(rafInner)
      }
    }

    if (prefersReducedMotion()) {
      spinnerMountedRef.current = false
      setOpaque(false)
      setSpinnerMounted(false)
      setDrawReady(true)
      return
    }

    const afterSpinnerGone = () => {
      if (cancelled) return
      spinnerMountedRef.current = false
      setSpinnerMounted(false)
      timers.push(
        window.setTimeout(() => {
          if (!cancelled) setDrawReady(true)
        }, CHART_DRAW_BUFFER_MS)
      )
    }

    const startFadeOut = () => {
      if (cancelled) return
      setFadeMs(SPINNER_FADE_OUT_MS)
      rafOuter = requestAnimationFrame(() => {
        if (cancelled) return
        setOpaque(false)
        timers.push(window.setTimeout(afterSpinnerGone, SPINNER_FADE_OUT_MS))
      })
    }

    if (!spinnerMountedRef.current) {
      afterSpinnerGone()
      return () => {
        cancelled = true
        for (const id of timers) clearTimeout(id)
      }
    }

    // Finish a full fade-in before fading out (even if data loaded early).
    if (!spinnerOpaqueRef.current) {
      setFadeMs(SPINNER_FADE_IN_MS)
      setOpaque(true)
      fadeInCompleteAtRef.current = performance.now() + SPINNER_FADE_IN_MS
    }

    const waitForFadeIn = Math.max(
      0,
      fadeInCompleteAtRef.current - performance.now()
    )
    timers.push(window.setTimeout(startFadeOut, waitForFadeIn))

    return () => {
      cancelled = true
      cancelAnimationFrame(rafOuter)
      cancelAnimationFrame(rafInner)
      for (const id of timers) clearTimeout(id)
    }
  }, [loading])

  return { spinnerMounted, spinnerOpaque, fadeMs, drawReady }
}

/** Reset + double-rAF reveal so chart entrance animations replay when `replayKey` changes. */
function useChartReveal(replayKey: string) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setRevealed(true)
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setRevealed(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [replayKey])

  return revealed
}

function normalize(values: number[], top = 14, bottom = 86): Point[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values.map((value, index) => ({
    x: values.length === 1 ? 50 : (index / (values.length - 1)) * 100,
    y: bottom - ((value - min) / range) * (bottom - top),
    value,
  }))
}

function smoothPath(points: Point[]) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function formatDayLabel(iso: string): string {
  if (!iso || iso.length < 10) return iso
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function ChartScrubber({
  points,
  labels,
  tooltipLabel,
  formatPoint,
  viewBox,
  children,
  ariaLabel,
  showMarker = true,
}: {
  points: Point[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
  viewBox: { width: number; height: number; minX?: number }
  children?: React.ReactNode
  ariaLabel: string
  showMarker?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<HoverState | null>(null)
  const [tipY, setTipY] = useState(0)
  const tipYRef = useRef(0)
  const targetYRef = useRef(0)
  const hoveringRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  const ensureAnim = useCallback(() => {
    if (rafRef.current != null) return
    const tick = () => {
      const current = tipYRef.current
      const target = targetYRef.current
      const next = current + (target - current) * 0.2
      tipYRef.current = Math.abs(target - next) < 0.25 ? target : next
      setTipY(tipYRef.current)
      if (hoveringRef.current && Math.abs(target - tipYRef.current) >= 0.25) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const resolveIndex = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!points.length) return 0
      const minX = viewBox.minX ?? 0
      const xPct = ((clientX - rect.left) / rect.width) * viewBox.width + minX
      let best = 0
      let bestDist = Infinity
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - xPct)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
      return best
    },
    [points, viewBox.minX, viewBox.width]
  )

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!points.length || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const index = resolveIndex(e.clientX, rect)
    const point = points[index]
    const pointerX = e.clientX - rect.left
    const pointerY = e.clientY - rect.top
    const tipOnRight = pointerX < rect.width * 0.5
    const pointPxY = (point.y / viewBox.height) * rect.height
    // Blend cursor Y with series Y so vertical follow feels fluid but stays near the point
    const targetY = clamp(pointerY * 0.45 + pointPxY * 0.55, 16, rect.height - 16)

    if (!hoveringRef.current) {
      tipYRef.current = targetY
      setTipY(targetY)
    }
    hoveringRef.current = true
    targetYRef.current = targetY
    ensureAnim()

    setHover({
      index,
      point,
      label: labels?.[index] ? formatDayLabel(labels[index]) : tooltipLabel,
      pointerX,
      targetY,
      tipOnRight,
    })
  }

  const onPointerLeave = () => {
    hoveringRef.current = false
    setHover(null)
  }

  const minX = viewBox.minX ?? 0

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-visible"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={(e) => e.preventDefault()}
    >
      <svg
        viewBox={`${minX} 0 ${viewBox.width} ${viewBox.height}`}
        className="h-full w-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {children}
        {hover && (
          <line
            x1={hover.point.x}
            x2={hover.point.x}
            y1={viewBox.height * 0.08}
            y2={viewBox.height * 0.92}
            stroke="var(--accent-primary)"
            strokeOpacity="0.18"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {hover && showMarker && (
        <div
          className="pointer-events-none absolute z-20 size-2.5 rounded-full border-2 border-white"
          style={{
            left: `${((hover.point.x - minX) / viewBox.width) * 100}%`,
            top: `${(hover.point.y / viewBox.height) * 100}%`,
            background: 'var(--accent-primary)',
            transform: 'translate(-50%, -50%)',
          }}
          aria-hidden
        />
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-30 flex items-center gap-2 rounded-full border border-border/50 bg-white px-2.5 py-1.5 shadow-[0_4px_16px_rgba(15,23,42,0.14)] dark:bg-card"
          style={{
            left: hover.pointerX,
            top: tipY,
            transform: hover.tipOnRight
              ? 'translate(14px, -50%)'
              : 'translate(calc(-100% - 14px), -50%)',
            transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          aria-hidden
        >
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: 'var(--accent-primary)' }}
          />
          <span className="whitespace-nowrap text-[11px] text-muted">{hover.label}</span>
          <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-foreground">
            {formatPoint(hover.point.value)}
          </span>
        </div>
      )}

      {hover && (
        <span className="sr-only">
          {tooltipLabel} {hover.label}: {formatPoint(hover.point.value)}
        </span>
      )}
    </div>
  )
}

function BarsChart({
  data,
  labels,
  tooltipLabel,
  formatPoint,
}: {
  data: number[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
}) {
  const max = Math.max(...data, 1)
  const n = Math.max(data.length, 1)
  const dataKey = data.join('|')
  const revealed = useChartReveal(dataKey)
  const points: Point[] = data.map((value, index) => {
    const fillFrac = Math.max(0.08, value / max)
    return {
      x: ((index + 0.5) / n) * 100,
      y: (1 - fillFrac) * 76 + 8,
      value,
    }
  })

  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 flex items-stretch px-0.5 pb-1 pt-2',
          n > 16 ? 'gap-px' : n > 10 ? 'gap-0.5' : 'gap-1.5'
        )}
        aria-hidden
      >
        {data.map((value, index) => {
          const fillPct = Math.max(8, (value / max) * 100)
          return (
            <div key={index} className="relative min-w-0 flex-1">
              <div className="absolute inset-0 rounded-full bg-[var(--accent-primary-soft)]" />
              <div
                className="absolute inset-x-0 bottom-0 rounded-full bg-[var(--accent-primary)]"
                style={{
                  height: revealed ? `${fillPct}%` : '0%',
                  transition: revealed
                    ? `height ${CHART_REVEAL_MS}ms ${CHART_REVEAL_EASE}`
                    : 'none',
                }}
              />
            </div>
          )
        })}
      </div>
      <ChartScrubber
        points={points}
        labels={labels}
        tooltipLabel={tooltipLabel}
        formatPoint={formatPoint}
        viewBox={{ width: 100, height: 100 }}
        ariaLabel="Compact vertical bar chart"
        showMarker={false}
      />
    </div>
  )
}

function AreaChart({
  data,
  labels,
  tooltipLabel,
  formatPoint,
}: {
  data: number[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
}) {
  const reactId = useId().replace(/:/g, '')
  const gradientId = `metric-area-fill-${reactId}`
  const clipId = `metric-area-clip-${reactId}`
  const points = normalize(data)
  const line = smoothPath(points)
  const area = `${line} L 100 100 L 0 100 Z`
  const dataKey = data.join('|')
  const revealed = useChartReveal(dataKey)

  return (
    <ChartScrubber
      points={points}
      labels={labels}
      tooltipLabel={tooltipLabel}
      formatPoint={formatPoint}
      viewBox={{ width: 100, height: 100 }}
      ariaLabel="Compact smooth area chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect
            x="0"
            y="0"
            height="100"
            width={revealed ? 100 : 0}
            style={{
              transition: revealed
                ? `width ${CHART_REVEAL_MS}ms ${CHART_REVEAL_EASE}`
                : 'none',
            }}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="1.8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </ChartScrubber>
  )
}

function LineChart({
  data,
  labels,
  tooltipLabel,
  formatPoint,
}: {
  data: number[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
}) {
  const reactId = useId().replace(/:/g, '')
  const clipId = `metric-line-clip-${reactId}`
  const points = normalize(data, 14, 82)
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const dataKey = data.join('|')
  const revealed = useChartReveal(dataKey)

  return (
    <ChartScrubber
      points={points}
      labels={labels}
      tooltipLabel={tooltipLabel}
      formatPoint={formatPoint}
      viewBox={{ width: 100, height: 100 }}
      ariaLabel="Compact line chart"
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x="0"
            y="0"
            height="100"
            width={revealed ? 100 : 0}
            style={{
              transition: revealed
                ? `width ${CHART_REVEAL_MS}ms ${CHART_REVEAL_EASE}`
                : 'none',
            }}
          />
        </clipPath>
      </defs>
      {points.map((point, index) => (
        <line
          key={`grid-${index}`}
          x1={point.x}
          x2={point.x}
          y1="10"
          y2="88"
          stroke="var(--border)"
          strokeWidth="0.8"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </ChartScrubber>
  )
}

function StepChart({
  data,
  labels,
  tooltipLabel,
  formatPoint,
}: {
  data: number[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
}) {
  const points = normalize(data, 13, 84)
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <ChartScrubber
      points={points}
      labels={labels}
      tooltipLabel={tooltipLabel}
      formatPoint={formatPoint}
      viewBox={{ width: 100, height: 100 }}
      ariaLabel="Compact stepped line chart"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--accent-secondary)"
        strokeWidth="2.1"
        strokeLinejoin="miter"
        strokeLinecap="square"
        vectorEffect="non-scaling-stroke"
      />
    </ChartScrubber>
  )
}

function DonutChart({
  value = 72,
  centerValue = '—',
  centerLabel = '',
  compactCenter = false,
  replayKey,
}: {
  value?: number
  centerValue?: string
  centerLabel?: string
  compactCenter?: boolean
  /** Changes (e.g. range label) force the fill animation to replay even if % is unchanged. */
  replayKey?: string
}) {
  const progress = clamp(value)
  const radius = 31
  const circumference = 2 * Math.PI * radius
  const targetOffset = circumference - (progress / 100) * circumference
  const animKey = replayKey ?? `${progress}|${centerValue}|${centerLabel}`
  const revealed = useChartReveal(animKey)

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full"
      role="img"
      aria-label={`${progress}% circular progress chart`}
    >
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth="10"
      />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="10"
        strokeLinecap="butt"
        strokeDasharray={circumference}
        strokeDashoffset={revealed ? targetOffset : circumference}
        transform="rotate(-90 50 50)"
        style={{
          transition: revealed
            ? `stroke-dashoffset ${CHART_REVEAL_MS}ms ${CHART_REVEAL_EASE}`
            : 'none',
        }}
      />
      <text
        x="50"
        y={centerLabel ? '48' : '54'}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={compactCenter ? '16' : '15'}
        fontWeight="600"
        fontFamily="var(--font-app), ui-sans-serif, system-ui, sans-serif"
      >
        {centerValue}
      </text>
      {centerLabel ? (
        <text x="50" y="64" textAnchor="middle" fill="var(--muted)" fontSize="9">
          {centerLabel}
        </text>
      ) : null}
    </svg>
  )
}

function RateBreakdown({
  primary,
  secondary,
  donutValue,
  centerValue,
  replayKey,
}: {
  primary: MetricRateRow
  secondary: MetricRateRow
  donutValue?: number
  centerValue?: string
  replayKey: string
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-3 pt-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-stretch gap-2.5 border-b border-border py-2.5">
          <span className="w-1 shrink-0 rounded-full bg-accent-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted">{primary.label}</p>
            <p className="mt-0.5 text-[1.35rem] leading-none tracking-tight text-foreground tabular-nums">
              {primary.value}
            </p>
          </div>
        </div>
        <div className="flex items-stretch gap-2.5 py-2.5">
          <span className="w-1 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted">{secondary.label}</p>
            <p className="mt-0.5 text-[1.35rem] leading-none tracking-tight text-foreground tabular-nums">
              {secondary.value}
            </p>
          </div>
        </div>
      </div>
      <div className="h-[104px] w-[104px] shrink-0">
        <DonutChart
          value={donutValue}
          centerValue={centerValue}
          compactCenter
          replayKey={replayKey}
        />
      </div>
    </div>
  )
}

function Chart({
  kind,
  data,
  labels,
  tooltipLabel,
  formatPoint,
  donutValue,
  centerValue,
  centerLabel,
}: {
  kind: Exclude<ChartKind, 'rate'>
  data?: number[]
  labels?: string[]
  tooltipLabel: string
  formatPoint: (value: number) => string
  donutValue?: number
  centerValue?: string
  centerLabel?: string
}) {
  const series = data?.length ? data : [0]
  switch (kind) {
    case 'bars':
      return (
        <BarsChart
          data={series}
          labels={labels}
          tooltipLabel={tooltipLabel}
          formatPoint={formatPoint}
        />
      )
    case 'area':
      return (
        <AreaChart
          data={series}
          labels={labels}
          tooltipLabel={tooltipLabel}
          formatPoint={formatPoint}
        />
      )
    case 'line':
      return (
        <LineChart
          data={series}
          labels={labels}
          tooltipLabel={tooltipLabel}
          formatPoint={formatPoint}
        />
      )
    case 'step':
      return (
        <StepChart
          data={series}
          labels={labels}
          tooltipLabel={tooltipLabel}
          formatPoint={formatPoint}
        />
      )
    case 'donut':
      return (
        <DonutChart
          value={donutValue}
          centerValue={centerValue}
          centerLabel={centerLabel}
          replayKey={`${donutValue ?? 0}|${centerValue ?? ''}|${centerLabel ?? ''}`}
        />
      )
  }
}

export function MetricCard({
  title,
  subtitle,
  value,
  change,
  chart,
  data,
  labels,
  tooltipLabel,
  formatPoint,
  donutValue,
  centerValue,
  centerLabel,
  ratePrimary,
  rateSecondary,
  badge,
  className,
  href,
  onOpen,
  loading = false,
}: MetricCardProps) {
  const trimmed = change.trim()
  const isNegative = trimmed.startsWith('-')
  const isNeutral = !trimmed || trimmed === '—' || trimmed === '0%' || trimmed === '+0%'
  const seriesLabel = tooltipLabel ?? title
  const pointFormatter = formatPoint ?? ((n: number) => formatMetricCount(n))
  const isRate = chart === 'rate'
  const rateReplayKey = `${subtitle}|${donutValue ?? 0}|${centerValue ?? ''}|${ratePrimary?.value ?? ''}|${rateSecondary?.value ?? ''}`
  const interactive = Boolean(onOpen || href)
  const { spinnerMounted, spinnerOpaque, fadeMs, drawReady } =
    useMetricCardPhases(loading)

  const body = (
    <article
      className={cn(
        'relative flex min-h-[240px] flex-col overflow-visible rounded-lg border border-border/70 bg-white p-4 shadow-sm dark:bg-card',
        interactive &&
          'transition-[box-shadow,border-color,transform] hover:-translate-y-0.5 hover:border-border hover:shadow-md',
        onOpen && 'cursor-pointer',
        className
      )}
      {...(onOpen
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: onOpen,
            onKeyDown: (e: ReactKeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen()
              }
            },
          }
        : {})}
    >
      {drawReady ? (
        <>
          <header className={cn(isRate && 'flex items-start justify-between gap-2')}>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
              {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
            </div>
            {isRate && badge ? (
              <span className="shrink-0 rounded-full border border-border/80 px-2 py-0.5 text-[11px] font-medium text-muted">
                {badge}
              </span>
            ) : null}
          </header>

          {chart === 'rate' ? (
            ratePrimary && rateSecondary ? (
              <div className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-1400 fill-mode-both">
                <RateBreakdown
                  primary={ratePrimary}
                  secondary={rateSecondary}
                  donutValue={donutValue}
                  centerValue={centerValue}
                  replayKey={rateReplayKey}
                />
              </div>
            ) : null
          ) : (
            <>
              <div
                className={
                  chart === 'donut'
                    ? 'mx-auto mt-4 h-[96px] w-[96px]'
                    : 'relative -mx-4 mt-4 h-[92px] w-[calc(100%+2rem)] overflow-visible'
                }
              >
                <div className="h-full w-full animate-in fade-in-0 duration-1400 fill-mode-both">
                  <Chart
                    kind={chart}
                    data={data}
                    labels={labels}
                    tooltipLabel={seriesLabel}
                    formatPoint={pointFormatter}
                    donutValue={donutValue}
                    centerValue={centerValue}
                    centerLabel={centerLabel}
                  />
                </div>
              </div>

              <footer className="mt-auto flex items-end justify-between gap-3 pt-3 animate-in fade-in-0 duration-1400 fill-mode-both">
                <span className="text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground">
                  {value}
                </span>
                <span
                  className={cn(
                    'text-sm tabular-nums leading-none',
                    isNeutral && 'text-muted',
                    !isNeutral && isNegative && 'text-destructive',
                    !isNeutral && !isNegative && 'text-accent-primary'
                  )}
                >
                  {change}
                </span>
              </footer>
            </>
          )}
        </>
      ) : null}

      {spinnerMounted ? (
        <div
          className={cn(
            'absolute inset-0 z-10 flex items-center justify-center ease-in-out',
            spinnerOpaque ? 'opacity-100' : 'opacity-0'
          )}
          style={{
            transitionProperty: 'opacity',
            transitionDuration: `${fadeMs}ms`,
          }}
          role="status"
          aria-label="Loading chart"
          aria-hidden={!spinnerOpaque}
        >
          <Spinner className="size-12 text-accent-primary" />
        </div>
      ) : null}
    </article>
  )

  if (onOpen) {
    return body
  }

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    )
  }

  return body
}

export function formatMetricCount(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return String(Math.round(n))
}

export function formatMetricChange(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '—'
  if (previous === 0) {
    if (current === 0) return '0%'
    return '+100%'
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}
