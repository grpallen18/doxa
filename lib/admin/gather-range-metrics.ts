import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregatesFromRpcRows,
  buildRangeHealthSections,
  type AdminHealthMetricSection,
} from '@/lib/admin/gather-health-metrics'
import {
  METRIC_RANGE_DAYS,
  metricRangeSince,
  type MetricRange,
} from '@/lib/admin/metric-range'

export type DashboardMetrics = {
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
  gating: {
    days: string[]
    keep: number[]
    drop: number[]
    pending: number[]
    keepTotal: number
    dropTotal: number
    pendingTotal: number
    pendingNow: number
    periodTotal: number
    decidedTotal: number
    keepRate: number
  }
}

export type AdminRangeMetricsPayload = {
  range: MetricRange
  windowDays: number
  sections: AdminHealthMetricSection[]
  charts: DashboardMetrics
}

type DayCount = { day: string; count: number }

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

function sampleSeries<T>(arr: T[], windowDays: number): T[] {
  const samplePoints = windowDays <= 7 ? windowDays : windowDays <= 30 ? 24 : 28
  if (arr.length <= samplePoints) return arr
  const step = (arr.length - 1) / (samplePoints - 1)
  return Array.from({ length: samplePoints }, (_, i) => arr[Math.round(i * step)]!)
}

/** Range-scoped chart + KPI data from a single RPC batch. */
export async function gatherAdminRangeMetrics(
  supabase: SupabaseClient,
  range: MetricRange
): Promise<AdminRangeMetricsPayload> {
  const windowDays = METRIC_RANGE_DAYS[range]
  const { since, sinceIso } = metricRangeSince(range)
  const now = new Date()

  const [
    totalRes,
    dailyCountsRes,
    baselineRes,
    qaRes,
    keepRes,
    relevanceTotalRes,
    pendingNowRes,
    scrapeRes,
    gatingRes,
    graphsSucceededRes,
    graphsFailedRes,
    graphsQuarantinedRes,
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
    supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .or('relevance_status.eq.PENDING,relevance_status.is.null'),
    supabase.rpc('get_scrape_counts_by_day', { p_days: windowDays }),
    supabase.rpc('get_story_gating_counts_by_day', { p_since: sinceIso }),
    supabase
      .from('graph_processing_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'succeeded')
      .gte('finished_at', sinceIso),
    supabase
      .from('graph_processing_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('finished_at', sinceIso),
    supabase
      .from('graph_processing_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'quarantined')
      .gte('finished_at', sinceIso),
  ])

  if (dailyCountsRes.error) throw dailyCountsRes.error
  if (scrapeRes.error) throw scrapeRes.error
  if (gatingRes.error) throw gatingRes.error
  if (graphsSucceededRes.error) throw graphsSucceededRes.error
  if (graphsFailedRes.error) throw graphsFailedRes.error
  if (graphsQuarantinedRes.error) throw graphsQuarantinedRes.error

  const totalStories = totalRes.count ?? 0
  const countsByDay = new Map<string, number>()
  let periodRowSum = 0
  for (const row of (dailyCountsRes.data ?? []) as {
    day: string
    count: number | string
  }[]) {
    const day = String(row.day).slice(0, 10)
    const count = Number(row.count ?? 0)
    countsByDay.set(day, count)
    periodRowSum += count
  }

  const baseline = baselineRes.count ?? Math.max(0, totalStories - periodRowSum)
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

  const gatingByDay = new Map<string, { keep: number; drop: number; pending: number }>()
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
  const gatingDays = [...gatingByDay.entries()].sort(([a], [b]) => a.localeCompare(b))
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
  const gatingDecidedTotal = gatingKeepTotal + gatingDropTotal
  const gatingPeriodTotal = gatingKeepTotal + gatingDropTotal + gatingPendingTotal
  const gatingKeepRate =
    gatingDecidedTotal === 0
      ? 0
      : Math.round((gatingKeepTotal / gatingDecidedTotal) * 1000) / 10
  const gatingPendingNow = pendingNowRes.count ?? 0

  const sample = <T,>(arr: T[]) => sampleSeries(arr, windowDays)

  const rangeAggregates = aggregatesFromRpcRows(
    dailyCountsRes.data as { count: number | string | null }[] | null,
    gatingRes.data as {
      keep_count: number | string | null
      drop_count: number | string | null
      pending_count: number | string | null
    }[] | null,
    scrapeRes.data as {
      success_count: number | string | null
      failure_count: number | string | null
    }[] | null,
    graphsSucceededRes.count ?? 0,
    graphsFailedRes.count ?? 0,
    graphsQuarantinedRes.count ?? 0
  )

  const charts: DashboardMetrics = {
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
    qa: { pending: qaPending },
    relevance: { keepCount, keepRate, totalClassified: relevanceTotal },
    gating: {
      days: sample(gatingDayKeys),
      keep: sample(gatingKeep),
      drop: sample(gatingDrop),
      pending: sample(gatingPending),
      keepTotal: gatingKeepTotal,
      dropTotal: gatingDropTotal,
      pendingTotal: gatingPendingTotal,
      pendingNow: gatingPendingNow,
      periodTotal: gatingPeriodTotal,
      decidedTotal: gatingDecidedTotal,
      keepRate: gatingKeepRate,
    },
  }

  return {
    range,
    windowDays,
    sections: buildRangeHealthSections(rangeAggregates),
    charts,
  }
}
