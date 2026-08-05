'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/admin/record/status-badge'
import {
  formatNeoDate,
  graphStatusBadgeVariant,
} from '@/lib/admin/neo-types'
import type { GraphJobStatusPayload } from '@/lib/graph/versions'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

const NeoGraphExplorer = dynamic(
  () =>
    import('@/components/admin/neo/graph-explorer').then((m) => m.NeoGraphExplorer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#121212] text-sm text-zinc-400">
        Loading graph explorer…
      </div>
    ),
  }
)

const POLL_MS = 2500

export function NeoDocumentWorkspace({ storyId }: { storyId: string }) {
  const [graph, setGraph] = useState<NeoDocumentGraph | null>(null)
  const [jobStatus, setJobStatus] = useState<GraphJobStatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reprocessPending, setReprocessPending] = useState(false)
  const [reprocessError, setReprocessError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasProcessingRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const fetchStatus = useCallback(async (): Promise<GraphJobStatusPayload | null> => {
    const res = await fetch(
      `/api/admin/neo/documents/${encodeURIComponent(storyId)}/status`
    )
    const json = await res.json()
    if (!res.ok || json.error) {
      throw new Error(json?.error?.message ?? 'Failed to load graph status')
    }
    return json.data as GraphJobStatusPayload
  }, [storyId])

  const loadGraph = useCallback(async () => {
    const graphRes = await fetch(
      `/api/admin/neo/documents/${encodeURIComponent(storyId)}`
    )
    const graphJson = await graphRes.json()

    if (!graphRes.ok || graphJson.error) {
      setGraph(null)
      setError(graphJson?.error?.message ?? 'Failed to load Neo4j document graph')
    } else {
      setGraph(graphJson.data as NeoDocumentGraph)
      setError(null)
    }
  }, [storyId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [status] = await Promise.all([
        fetchStatus().catch(() => null),
        loadGraph(),
      ])
      if (status) setJobStatus(status)
    } catch {
      setGraph(null)
      setError('Failed to load Neo document workspace')
    } finally {
      setLoading(false)
    }
  }, [fetchStatus, loadGraph])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const processing = Boolean(jobStatus?.is_processing) || reprocessPending
    if (!processing) {
      stopPolling()
      return
    }

    wasProcessingRef.current = true

    if (pollRef.current) return

    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const next = await fetchStatus()
          if (!next) return
          setJobStatus(next)
          if (!next.is_processing) {
            setReprocessPending(false)
            stopPolling()
            if (wasProcessingRef.current) {
              await loadGraph()
            }
            wasProcessingRef.current = false
          } else {
            wasProcessingRef.current = true
          }
        } catch {
          // keep polling; transient errors are fine
        }
      })()
    }, POLL_MS)

    return stopPolling
  }, [
    jobStatus?.is_processing,
    reprocessPending,
    fetchStatus,
    loadGraph,
    stopPolling,
  ])

  const onReprocess = async () => {
    setReprocessError(null)
    setReprocessPending(true)
    wasProcessingRef.current = true
    try {
      const res = await fetch(
        `/api/admin/neo/documents/${encodeURIComponent(storyId)}/reprocess`,
        { method: 'POST' }
      )
      const json = await res.json()
      if (!res.ok || json.error) {
        setReprocessPending(false)
        wasProcessingRef.current = false
        setReprocessError(json?.error?.message ?? 'Failed to enqueue reprocess')
        return
      }
      const status = (json.data?.status as GraphJobStatusPayload | null) ?? null
      if (status) setJobStatus(status)
      if (json.data?.skipped && !status?.is_processing) {
        // Running job too fresh to force — treat as processing if status says so
        setReprocessPending(Boolean(status?.is_processing))
      }
    } catch {
      setReprocessPending(false)
      wasProcessingRef.current = false
      setReprocessError('Failed to enqueue reprocess')
    }
  }

  const title = graph?.document.title ?? 'Neo document'
  const isProcessing = Boolean(jobStatus?.is_processing) || reprocessPending
  const displayStatus = isProcessing
    ? jobStatus?.graph_status === 'running' || jobStatus?.job_status === 'running'
      ? 'running'
      : 'pending'
    : jobStatus?.graph_status ?? jobStatus?.job_status ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0f0f0f]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Link href="/admin/neo" className="hover:text-zinc-300 hover:underline">
              Neo
            </Link>
            <span aria-hidden>/</span>
            <span className="font-mono">{storyId.slice(0, 8)}…</span>
            {displayStatus ? (
              <StatusBadge
                label={isProcessing ? 'reprocessing' : displayStatus}
                variant={graphStatusBadgeVariant(displayStatus)}
                className="normal-case"
              />
            ) : null}
          </div>
          <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight text-zinc-100">
            {title}
          </h1>
          {graph || jobStatus ? (
            <p className="mt-1 text-[11px] text-zinc-500">
              {jobStatus?.job_finished_at ? (
                <>
                  Last graphed {formatNeoDate(jobStatus.job_finished_at)}
                  {' · '}
                </>
              ) : null}
              schema{' '}
              {jobStatus?.schema_version ??
                graph?.document.schemaVersion ??
                '—'}
              {(jobStatus?.extractor_version ?? graph?.document.extractorVersion)
                ? ` · ${jobStatus?.extractor_version ?? graph?.document.extractorVersion}`
                : ''}
              {graph
                ? ` · ${graph.phase1.propositionCount} propositions · ${graph.phase1.entityCount} entities · ${graph.phase2?.argumentCount ?? 0} arguments · ${graph.phase1.expressesCount} EXPRESSES`
                : ''}
            </p>
          ) : null}
          {reprocessError ? (
            <p className="mt-1 text-[11px] text-red-400">{reprocessError}</p>
          ) : null}
          {jobStatus?.job_error &&
          (jobStatus.graph_status === 'failed' ||
            jobStatus.graph_status === 'quarantined') ? (
            <p className="mt-1 max-w-3xl text-[11px] text-amber-300/90 whitespace-pre-wrap break-words">
              {jobStatus.job_error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
            disabled={isProcessing}
            onClick={() => void onReprocess()}
          >
            {isProcessing ? 'Reprocessing…' : 'Reprocess'}
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
          >
            <Link href={`/admin/stories/${storyId}`}>Story hub</Link>
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="p-6 text-sm text-zinc-400">Loading discourse graph…</p>
      ) : error && !graph ? (
        <div className="space-y-3 p-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : isProcessing && !graph ? (
        <p className="p-6 text-sm text-zinc-400">
          Graph job is running. This view will refresh when it finishes…
        </p>
      ) : graph ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {isProcessing ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border border-amber-500/30 bg-zinc-950/95 px-3 py-1.5 text-xs text-amber-200 shadow-lg">
              Reprocessing graph… results will refresh when done
            </div>
          ) : null}
          <NeoGraphExplorer graph={graph} storyId={storyId} />
        </div>
      ) : null}
    </div>
  )
}
