'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PLACEHOLDER_RANGE_HEALTH_SECTIONS,
  PLACEHOLDER_SNAPSHOT_HEALTH_SECTIONS,
  type AdminHealthMetricSection,
} from '@/lib/admin/admin-health-metrics'
import type { DashboardMetrics } from '@/lib/admin/gather-range-metrics'
import type { MetricRange } from '@/lib/admin/metric-range'

export const SNAPSHOT_POLL_MS = 15_000
const POLL_BACKOFF_MAX_MS = 120_000

type ApiEnvelope<T> = {
  data: T | null
  error: { message?: string } | null
}

async function fetchJson<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal })
  const json = (await res.json()) as ApiEnvelope<T>
  if (!res.ok) {
    throw new Error(json.error?.message ?? 'Request failed')
  }
  if (!json.data) {
    throw new Error('Empty response')
  }
  return json.data
}

export function useAdminMetrics(range: MetricRange) {
  const [rangeSections, setRangeSections] = useState<AdminHealthMetricSection[]>(
    () => PLACEHOLDER_RANGE_HEALTH_SECTIONS
  )
  const [snapshotSections, setSnapshotSections] = useState<
    AdminHealthMetricSection[]
  >(() => PLACEHOLDER_SNAPSHOT_HEALTH_SECTIONS)
  const [charts, setCharts] = useState<DashboardMetrics | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [rangeLoading, setRangeLoading] = useState(true)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const pollFailuresRef = useRef(0)
  const rangeAbortRef = useRef<AbortController | null>(null)
  const hasLoadedChartsRef = useRef(false)

  const loadSnapshot = useCallback(async (signal?: AbortSignal) => {
    const data = await fetchJson<{ sections: AdminHealthMetricSection[] }>(
      '/api/admin/metrics-snapshot',
      signal
    )
    setSnapshotSections(data.sections)
    pollFailuresRef.current = 0
    setSnapshotError(null)
  }, [])

  const loadRange = useCallback(
    async (signal?: AbortSignal) => {
      const data = await fetchJson<{
        sections: AdminHealthMetricSection[]
        charts: DashboardMetrics
      }>(`/api/admin/metrics-range?range=${range}`, signal)

      setRangeSections(data.sections)
      setCharts(data.charts)
      hasLoadedChartsRef.current = true
      setRangeError(null)
    },
    [range]
  )

  useEffect(() => {
    rangeAbortRef.current?.abort()
    const controller = new AbortController()
    rangeAbortRef.current = controller

    let cancelled = false
    ;(async () => {
      setRangeLoading(true)
      setRangeError(null)
      try {
        await loadRange(controller.signal)
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setRangeError(err instanceof Error ? err.message : 'Failed to load metrics')
        if (!hasLoadedChartsRef.current) setCharts(null)
      } finally {
        if (!cancelled) setRangeLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [loadRange])

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let snapshotAbort: AbortController | null = null

    const schedulePoll = (delayMs: number) => {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = setTimeout(() => {
        if (cancelled || document.visibilityState === 'hidden') {
          schedulePoll(SNAPSHOT_POLL_MS)
          return
        }
        void pollSnapshot()
      }, delayMs)
    }

    const pollSnapshot = async () => {
      snapshotAbort?.abort()
      snapshotAbort = new AbortController()
      try {
        await loadSnapshot(snapshotAbort.signal)
      } catch (err) {
        if (snapshotAbort.signal.aborted || cancelled) return
        pollFailuresRef.current += 1
        const backoff = Math.min(
          SNAPSHOT_POLL_MS * 2 ** pollFailuresRef.current,
          POLL_BACKOFF_MAX_MS
        )
        setSnapshotError(
          err instanceof Error ? err.message : 'Failed to load live metrics'
        )
        schedulePoll(backoff)
        return
      }
      schedulePoll(SNAPSHOT_POLL_MS)
    }

    ;(async () => {
      setInitialLoading(true)
      setSnapshotError(null)
      try {
        await loadSnapshot()
      } catch (err) {
        if (!cancelled) {
          setSnapshotError(
            err instanceof Error ? err.message : 'Failed to load live metrics'
          )
        }
      } finally {
        if (!cancelled) setInitialLoading(false)
      }
      schedulePoll(SNAPSHOT_POLL_MS)
    })()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pollSnapshot()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
      snapshotAbort?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadSnapshot])

  return {
    rangeSections,
    snapshotSections,
    charts,
    initialLoading,
    rangeLoading,
    snapshotError,
    rangeError,
  }
}
