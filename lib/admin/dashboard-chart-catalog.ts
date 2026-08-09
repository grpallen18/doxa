export const CHART_CATALOG_IDS = [
  'stories',
  'daily_ingest',
  'story_gating',
  'scrape_rate',
  'qa_backlog',
] as const

export type ChartCatalogId = (typeof CHART_CATALOG_IDS)[number]

export const CHART_SLOT_IDS = ['slot-0', 'slot-1', 'slot-2', 'slot-3'] as const

export type ChartSlotId = (typeof CHART_SLOT_IDS)[number]

export type DashboardChartPrefs = {
  titles: Record<ChartCatalogId, string>
  slots: Record<ChartSlotId, ChartCatalogId>
}

export const DEFAULT_CHART_TITLES: Record<ChartCatalogId, string> = {
  stories: 'Stories',
  daily_ingest: 'Daily ingest',
  story_gating: 'Story Gating',
  scrape_rate: 'Scrape Rate',
  qa_backlog: 'QA backlog',
}

export const DEFAULT_CHART_HREFS: Record<ChartCatalogId, string> = {
  stories: '/admin/stories',
  daily_ingest: '/admin/stories',
  story_gating: '/admin/stories',
  scrape_rate: '/admin/health',
  qa_backlog: '/admin/stories',
}

export const DEFAULT_CHART_SLOTS: Record<ChartSlotId, ChartCatalogId> = {
  'slot-0': 'stories',
  'slot-1': 'story_gating',
  'slot-2': 'scrape_rate',
  'slot-3': 'qa_backlog',
}

export const DEFAULT_DASHBOARD_CHART_PREFS: DashboardChartPrefs = {
  titles: { ...DEFAULT_CHART_TITLES },
  slots: { ...DEFAULT_CHART_SLOTS },
}

const STORAGE_KEY = 'doxa-dashboard-chart-prefs'

function isChartCatalogId(value: unknown): value is ChartCatalogId {
  return (
    typeof value === 'string' &&
    (CHART_CATALOG_IDS as readonly string[]).includes(value)
  )
}

function isChartSlotId(value: unknown): value is ChartSlotId {
  return (
    typeof value === 'string' &&
    (CHART_SLOT_IDS as readonly string[]).includes(value)
  )
}

export function normalizeDashboardChartPrefs(
  raw: unknown
): DashboardChartPrefs {
  const titles = { ...DEFAULT_CHART_TITLES }
  const slots = { ...DEFAULT_CHART_SLOTS }

  if (!raw || typeof raw !== 'object') {
    return { titles, slots }
  }

  const record = raw as {
    titles?: unknown
    slots?: unknown
  }

  if (record.titles && typeof record.titles === 'object') {
    for (const [key, value] of Object.entries(
      record.titles as Record<string, unknown>
    )) {
      if (!isChartCatalogId(key)) continue
      if (typeof value === 'string' && value.trim()) {
        titles[key] = value.trim().slice(0, 80)
      }
    }
  }

  if (record.slots && typeof record.slots === 'object') {
    for (const [key, value] of Object.entries(
      record.slots as Record<string, unknown>
    )) {
      if (!isChartSlotId(key)) continue
      if (isChartCatalogId(value)) slots[key] = value
    }
  }

  return { titles, slots }
}

export function loadDashboardChartPrefs(): DashboardChartPrefs {
  if (typeof window === 'undefined') {
    return {
      titles: { ...DEFAULT_CHART_TITLES },
      slots: { ...DEFAULT_CHART_SLOTS },
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        titles: { ...DEFAULT_CHART_TITLES },
        slots: { ...DEFAULT_CHART_SLOTS },
      }
    }
    return normalizeDashboardChartPrefs(JSON.parse(raw) as unknown)
  } catch {
    return {
      titles: { ...DEFAULT_CHART_TITLES },
      slots: { ...DEFAULT_CHART_SLOTS },
    }
  }
}

export function saveDashboardChartPrefs(prefs: DashboardChartPrefs): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeDashboardChartPrefs(prefs)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}
