export const METRIC_RANGES = ['7d', '30d', '3m', '6m', '1y'] as const
export type MetricRange = (typeof METRIC_RANGES)[number]

export const METRIC_RANGE_DAYS: Record<MetricRange, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
}

export function parseMetricRange(raw: string | null): MetricRange {
  if (raw && (METRIC_RANGES as readonly string[]).includes(raw)) {
    return raw as MetricRange
  }
  return '30d'
}

export function metricRangeSince(range: MetricRange, now = new Date()): {
  windowDays: number
  since: Date
  sinceIso: string
} {
  const windowDays = METRIC_RANGE_DAYS[range]
  const since = new Date(now)
  since.setUTCDate(since.getUTCDate() - (windowDays - 1))
  since.setUTCHours(0, 0, 0, 0)
  return { windowDays, since, sinceIso: since.toISOString() }
}
