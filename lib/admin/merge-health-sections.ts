import type { AdminHealthMetricSection } from '@/lib/admin/gather-health-metrics'

/** Merge partial section lists by metric id; later lists override earlier values. */
export function mergeHealthSections(
  ...lists: AdminHealthMetricSection[][]
): AdminHealthMetricSection[] {
  const sectionOrder: string[] = []
  const sectionMeta = new Map<string, { title: string; metricOrder: string[] }>()
  const metricsById = new Map<
    string,
    AdminHealthMetricSection['metrics'][number]
  >()

  for (const sections of lists) {
    for (const section of sections) {
      if (!sectionMeta.has(section.id)) {
        sectionOrder.push(section.id)
        sectionMeta.set(section.id, { title: section.title, metricOrder: [] })
      }
      const meta = sectionMeta.get(section.id)!
      if (section.title) meta.title = section.title

      for (const metric of section.metrics) {
        if (!meta.metricOrder.includes(metric.id)) {
          meta.metricOrder.push(metric.id)
        }
        metricsById.set(metric.id, metric)
      }
    }
  }

  return sectionOrder
    .map((id) => {
      const meta = sectionMeta.get(id)!
      const metrics = meta.metricOrder
        .map((metricId) => metricsById.get(metricId))
        .filter((m): m is NonNullable<typeof m> => m != null)
      return { id, title: meta.title, metrics }
    })
    .filter((section) => section.metrics.length > 0)
}
