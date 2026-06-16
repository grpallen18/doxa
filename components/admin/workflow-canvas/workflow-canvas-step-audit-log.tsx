'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { HistoryEvent } from '@/lib/admin/history'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryStepRunHistoryRow } from '@/lib/admin/story-step-runs'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import {
  formatStepAuditAction,
  formatStepAuditStatus,
  historyEventsToStepAuditEntries,
  mergeStepAuditEntries,
  runsToStepAuditEntries,
  type StepAuditStatus,
} from '@/lib/admin/workflow-canvas/step-audit-log'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { PipelineDebugTracePanel } from '@/components/admin/pipeline/pipeline-debug-trace-panel'
import { cn } from '@/lib/utils'

function statusClassName(status: StepAuditStatus): string {
  switch (status) {
    case 'success':
      return 'text-emerald-400'
    case 'failed':
      return 'text-rose-400'
    case 'in_progress':
      return 'text-amber-400'
    default:
      return 'text-zinc-400'
  }
}

export function WorkflowCanvasStepAuditLog({
  storyId,
  stepId,
  chunkIndex,
  runs = [],
}: {
  storyId: string
  stepId: PipelineStepId
  chunkIndex?: number
  runs?: StoryStepRunHistoryRow[]
}) {
  const { refresh } = useStoryReview()
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const skipRunsBumpRef = useRef(true)

  useEffect(() => {
    skipRunsBumpRef.current = true
  }, [stepId, chunkIndex])

  const loadAuditLog = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({
      limit: '50',
      offset: '0',
      step_id: stepId,
    })
    if (chunkIndex != null) {
      params.set('chunk_index', String(chunkIndex))
    }

    const res = await fetch(`/api/admin/stories/${storyId}/audit?${params.toString()}`, {
      cache: 'no-store',
      signal,
    })
    const json = await res.json()
    if (!json.data?.events) {
      throw new Error(json.error?.message ?? 'Failed to load audit history')
    }
    return Array.isArray(json.data.events) ? (json.data.events as HistoryEvent[]) : []
  }, [storyId, stepId, chunkIndex])

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    if (refreshToken === 0) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    void loadAuditLog(controller.signal)
      .then((nextEvents) => {
        if (controller.signal.aborted) return
        setEvents(nextEvents)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load audit history')
        setEvents([])
      })
      .finally(() => {
        if (controller.signal.aborted) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => controller.abort()
  }, [loadAuditLog, refreshToken])

  const entries = useMemo(
    () =>
      mergeStepAuditEntries(
        historyEventsToStepAuditEntries(events),
        runsToStepAuditEntries(runs)
      ),
    [events, runs]
  )

  const runsRevision = useMemo(
    () => runs.map((run) => `${run.id}:${run.occurred_at}:${run.outcome}`).join('|'),
    [runs]
  )

  useEffect(() => {
    if (skipRunsBumpRef.current) {
      skipRunsBumpRef.current = false
      return
    }
    setRefreshToken((token) => token + 1)
  }, [runsRevision])

  const handleRefresh = () => {
    setRefreshToken((token) => token + 1)
    void refresh(true)
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading audit log…</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-50"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">No runs or reverts logged yet</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border border-white/5 bg-zinc-950/40 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <time
                  className="min-w-0 flex-1 text-xs tabular-nums text-zinc-500"
                  dateTime={entry.at}
                  title={formatAdminDateTime(entry.at)}
                >
                  {formatAdminDateTime(entry.at)}
                </time>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-300">
                    {formatStepAuditAction(entry.action)}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className={cn('font-medium', statusClassName(entry.status))}>
                    {formatStepAuditStatus(entry.status)}
                  </span>
                </div>
              </div>
              {entry.error ? (
                <p className="mt-1 text-xs text-rose-400">{entry.error}</p>
              ) : null}
              {entry.debugTrace ? (
                <PipelineDebugTracePanel trace={entry.debugTrace} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
