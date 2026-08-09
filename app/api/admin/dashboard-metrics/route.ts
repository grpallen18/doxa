import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const METRIC_RANGES = ['7d', '30d', '3m', '6m', '1y'] as const
type MetricRange = (typeof METRIC_RANGES)[number]

const RANGE_DAYS: Record<MetricRange, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
}

type DayCount = { day: string; count: number }

function parseRange(raw: string | null): MetricRange {
  if (raw && (METRIC_RANGES as readonly string[]).includes(raw)) {
    return raw as MetricRange
  }
  return '30d'
}

function enumerateDays(from: Date, to: Date): string[] {
  const days: string[] = []
  const cursor = new Date(from)
  cursor.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

function buildDailySeries(
  countsByDay: Map<string, number>,
  since: Date,
  now: Date
): DayCount[] {
  return enumerateDays(since, now).map((day) => ({
    day,
    count: countsByDay.get(day) ?? 0,
  }))
}

function toCumulative(daily: DayCount[], baseline: number): number[] {
  let running = baseline
  return daily.map((row) => {
    running += row.count
    return running
  })
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / Math.abs(previous)) * 100
}

function halfWindowChange(dailyCounts: number[]): number {
  if (dailyCounts.length < 2) return 0
  const mid = Math.floor(dailyCounts.length / 2)
  const first = dailyCounts.slice(0, mid).reduce((a, b) => a + b, 0)
  const second = dailyCounts.slice(mid).reduce((a, b) => a + b, 0)
  return pctChange(second, first)
}

type ScrapeDayBucket = { day: string; success_count: number; failure_count: number }

type GatingDayBucket = {
  day: string
  keep_count: number | string
  drop_count: number | string
  pending_count: number | string
}

/** Admin dashboard sparkline metrics. Query: ?range=7d|30d|3m|6m|1y */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const range = parseRange(request.nextUrl.searchParams.get('range'))
    const windowDays = RANGE_DAYS[range]

    const supabase = createAdminClient()
    const now = new Date()
    const since = new Date(now)
    since.setUTCDate(since.getUTCDate() - (windowDays - 1))
    since.setUTCHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()

    const [
      totalRes,
      dailyCountsRes,
      baselineRes,
      qaRes,
      keepRes,
      relevanceTotalRes,
      scrapeRes,
      gatingRes,
    ] = await Promise.all([
      supabase.from('stories').select('*', { count: 'exact', head: true }),
      supabase.rpc('get_story_ingest_counts_by_day', { p_since: sinceIso }),
      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', sinceIso),
      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('extraction_qa_status', 'needs_human_review'),
      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('relevance_status', 'KEEP'),
      supabase
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .not('relevance_status', 'is', null),
      supabase.rpc('get_scrape_counts_by_day', { p_days: windowDays }),
      supabase.rpc('get_story_gating_counts_by_day', { p_since: sinceIso }),
    ])

    if (dailyCountsRes.error) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: dailyCountsRes.error.message,
            code: dailyCountsRes.error.code,
          },
        },
        { status: 500 }
      )
    }

    if (scrapeRes.error) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: scrapeRes.error.message,
            code: scrapeRes.error.code,
          },
        },
        { status: 500 }
      )
    }

    if (gatingRes.error) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: gatingRes.error.message,
            code: gatingRes.error.code,
          },
        },
        { status: 500 }
      )
    }

    const totalStories = totalRes.count ?? 0
    const countsByDay = new Map<string, number>()
    let periodRowSum = 0
    for (const row of (dailyCountsRes.data ?? []) as { day: string; count: number | string }[]) {
      const day = String(row.day).slice(0, 10)
      const count = Number(row.count ?? 0)
      countsByDay.set(day, count)
      periodRowSum += count
    }

    const baseline =
      baselineRes.count ?? Math.max(0, totalStories - periodRowSum)

    const daily = buildDailySeries(countsByDay, since, now)
    const cumulative = toCumulative(daily, baseline)
    const dailyCounts = daily.map((d) => d.count)
    const periodIngest = dailyCounts.reduce((a, b) => a + b, 0)
    const storiesChange = halfWindowChange(dailyCounts)

    const endCum = cumulative[cumulative.length - 1] ?? totalStories
    const startCum = cumulative[0] ?? baseline
    const cumulativeChange = pctChange(endCum, Math.max(startCum, 1))

    const scrapeRows = (scrapeRes.data ?? []) as ScrapeDayBucket[]
    const scrapeByDay = new Map<string, { success: number; failure: number }>()
    for (const day of enumerateDays(since, now)) {
      scrapeByDay.set(day, { success: 0, failure: 0 })
    }
    for (const row of scrapeRows) {
      const day = String(row.day).slice(0, 10)
      const cur = scrapeByDay.get(day) ?? { success: 0, failure: 0 }
      cur.success += Number(row.success_count ?? 0)
      cur.failure += Number(row.failure_count ?? 0)
      scrapeByDay.set(day, cur)
    }
    const scrapeDays = [...scrapeByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
    const scrapeRates = scrapeDays.map(([, v]) => {
      const total = v.success + v.failure
      return total === 0 ? 0 : Math.round((v.success / total) * 1000) / 10
    })
    let scrapeSuccessTotal = 0
    let scrapeFailureTotal = 0
    for (const [, v] of scrapeDays) {
      scrapeSuccessTotal += v.success
      scrapeFailureTotal += v.failure
    }
    const scrapeAttemptTotal = scrapeSuccessTotal + scrapeFailureTotal
    const scrapeSuccessRate =
      scrapeAttemptTotal === 0
        ? 0
        : Math.round((scrapeSuccessTotal / scrapeAttemptTotal) * 1000) / 10
    const scrapeFailureRate =
      scrapeAttemptTotal === 0 ? 0 : Math.round((100 - scrapeSuccessRate) * 10) / 10
    const scrapeDayKeys = scrapeDays.map(([day]) => day)
    const scrapeWindow = scrapeRates.length ? scrapeRates : [0]
    const scrapeLatest = scrapeWindow[scrapeWindow.length - 1] ?? 0
    const scrapeHalf = Math.floor(scrapeWindow.length / 2)
    const scrapeFirstAvg =
      scrapeHalf > 0
        ? scrapeWindow.slice(0, scrapeHalf).reduce((a, b) => a + b, 0) / scrapeHalf
        : scrapeLatest
    const scrapeSecondAvg =
      scrapeWindow.length - scrapeHalf > 0
        ? scrapeWindow.slice(scrapeHalf).reduce((a, b) => a + b, 0) /
          (scrapeWindow.length - scrapeHalf)
        : scrapeLatest
    const scrapeChange = scrapeAttemptTotal === 0 ? 0 : scrapeSecondAvg - scrapeFirstAvg

    const qaPending = qaRes.count ?? 0
    const keepCount = keepRes.count ?? 0
    const relevanceTotal = relevanceTotalRes.count ?? 0
    const keepRate =
      relevanceTotal > 0 ? Math.round((keepCount / relevanceTotal) * 1000) / 10 : 0

    const gatingByDay = new Map<
      string,
      { keep: number; drop: number; pending: number }
    >()
    for (const day of enumerateDays(since, now)) {
      gatingByDay.set(day, { keep: 0, drop: 0, pending: 0 })
    }
    for (const row of (gatingRes.data ?? []) as GatingDayBucket[]) {
      const day = String(row.day).slice(0, 10)
      gatingByDay.set(day, {
        keep: Number(row.keep_count ?? 0),
        drop: Number(row.drop_count ?? 0),
        pending: Number(row.pending_count ?? 0),
      })
    }
    const gatingDays = [...gatingByDay.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )
    const gatingKeep = gatingDays.map(([, v]) => v.keep)
    const gatingDrop = gatingDays.map(([, v]) => v.drop)
    const gatingPending = gatingDays.map(([, v]) => v.pending)
    const gatingDayKeys = gatingDays.map(([day]) => day)
    let gatingKeepTotal = 0
    let gatingDropTotal = 0
    let gatingPendingTotal = 0
    for (const [, v] of gatingDays) {
      gatingKeepTotal += v.keep
      gatingDropTotal += v.drop
      gatingPendingTotal += v.pending
    }
    const gatingPeriodTotal =
      gatingKeepTotal + gatingDropTotal + gatingPendingTotal
    const gatingKeepRate =
      gatingPeriodTotal === 0
        ? 0
        : Math.round((gatingKeepTotal / gatingPeriodTotal) * 1000) / 10
    const gatingTotals = gatingDays.map(
      ([, v]) => v.keep + v.drop + v.pending
    )
    const mid = Math.floor(gatingDays.length / 2)
    const sumSlice = (arr: number[], from: number, to: number) =>
      arr.slice(from, to).reduce((a, b) => a + b, 0)
    const firstKeep = sumSlice(gatingKeep, 0, mid)
    const firstTotal = sumSlice(gatingTotals, 0, mid)
    const secondKeep = sumSlice(gatingKeep, mid, gatingDays.length)
    const secondTotal = sumSlice(gatingTotals, mid, gatingDays.length)
    const firstKeepRate =
      firstTotal === 0 ? 0 : (firstKeep / firstTotal) * 100
    const secondKeepRate =
      secondTotal === 0 ? 0 : (secondKeep / secondTotal) * 100
    const gatingKeepRateChange = secondKeepRate - firstKeepRate

    const samplePoints = windowDays <= 7 ? windowDays : windowDays <= 30 ? 24 : 28
    const sample = <T,>(arr: T[], maxPoints = samplePoints): T[] => {
      if (arr.length <= maxPoints) return arr
      const step = (arr.length - 1) / (maxPoints - 1)
      return Array.from({ length: maxPoints }, (_, i) => arr[Math.round(i * step)]!)
    }

    return NextResponse.json({
      data: {
        range,
        windowDays,
        stories: {
          total: totalStories,
          cumulative: sample(cumulative),
          daily: sample(dailyCounts),
          days: sample(daily.map((d) => d.day)),
          changePct: Math.round(storiesChange * 10) / 10,
          cumulativeChangePct: Math.round(cumulativeChange * 10) / 10,
          periodIngest,
        },
        scrape: {
          successRateSeries: sample(scrapeWindow),
          days: sample(scrapeDayKeys.length ? scrapeDayKeys : daily.map((d) => d.day)),
          latestRate: scrapeLatest,
          successRate: scrapeSuccessRate,
          failureRate: scrapeFailureRate,
          attemptCount: scrapeAttemptTotal,
          changePts: Math.round(scrapeChange * 10) / 10,
        },
        qa: {
          pending: qaPending,
        },
        relevance: {
          keepCount,
          keepRate,
          totalClassified: relevanceTotal,
        },
        gating: {
          days: sample(gatingDayKeys),
          keep: sample(gatingKeep),
          drop: sample(gatingDrop),
          pending: sample(gatingPending),
          keepTotal: gatingKeepTotal,
          dropTotal: gatingDropTotal,
          pendingTotal: gatingPendingTotal,
          periodTotal: gatingPeriodTotal,
          keepRate: gatingKeepRate,
          changePts: Math.round(gatingKeepRateChange * 10) / 10,
        },
      },
      error: null,
    })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { data: null, error: { message: 'Admin client not configured' } },
        { status: 503 }
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
