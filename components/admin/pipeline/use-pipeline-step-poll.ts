'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isChunkStepRunInvokeSettled } from '@/lib/admin/pipeline-step-run-display'
import {
  getStepOutputSnapshot,
  isStepBlocked,
  isStepComplete,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { showPipelineWarning } from '@/lib/admin/pipeline-toast'

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 36
const RERUN_DONE_POLL_THRESHOLD = 2

type StepRunBaseline = {
  snapshot: string
  complete: boolean
  blocked: boolean
  startedAtMs: number
}

export function usePipelineStepPoll({
  payload,
  onRefresh,
  chunkIndex,
  getStepSnapshot,
  resolveStepComplete,
  resolveStepBlocked,
}: {
  payload: StoryExtractionReviewPayload
  onRefresh: () => Promise<void>
  chunkIndex?: number
  getStepSnapshot?: (stepId: PipelineStepId, payload: StoryExtractionReviewPayload) => string
  resolveStepComplete?: (stepId: PipelineStepId, payload: StoryExtractionReviewPayload) => boolean
  resolveStepBlocked?: (stepId: PipelineStepId, payload: StoryExtractionReviewPayload) => boolean
}) {
  const [runningStepIds, setRunningStepIds] = useState<PipelineStepId[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const pollCountRef = useRef(0)
  const runBaselinesRef = useRef<Map<PipelineStepId, StepRunBaseline>>(new Map())
  const payloadRefreshCountsRef = useRef<Map<PipelineStepId, number>>(new Map())
  const invokeSettledRef = useRef<Set<PipelineStepId>>(new Set())

  const resolveSnapshot = useCallback(
    (stepId: PipelineStepId, p: StoryExtractionReviewPayload) => {
      if (getStepSnapshot) return getStepSnapshot(stepId, p)
      return JSON.stringify(getStepOutputSnapshot(stepId, p))
    },
    [getStepSnapshot]
  )

  const stepComplete = useCallback(
    (stepId: PipelineStepId, p: StoryExtractionReviewPayload) => {
      if (resolveStepComplete) return resolveStepComplete(stepId, p)
      return isStepComplete(stepId, p)
    },
    [resolveStepComplete]
  )

  const stepBlocked = useCallback(
    (stepId: PipelineStepId, p: StoryExtractionReviewPayload) => {
      if (resolveStepBlocked) return resolveStepBlocked(stepId, p)
      return isStepBlocked(stepId, p)
    },
    [resolveStepBlocked]
  )

  const isStepRunning = useCallback(
    (stepId: PipelineStepId) => runningStepIds.includes(stepId),
    [runningStepIds]
  )

  const clearRunningStep = useCallback((stepId: PipelineStepId) => {
    runBaselinesRef.current.delete(stepId)
    payloadRefreshCountsRef.current.delete(stepId)
    invokeSettledRef.current.delete(stepId)
    setRunningStepIds((prev) => prev.filter((id) => id !== stepId))
  }, [])

  const stopPolling = useCallback(() => {
    runBaselinesRef.current.clear()
    payloadRefreshCountsRef.current.clear()
    invokeSettledRef.current.clear()
    setRunningStepIds([])
    pollCountRef.current = 0
  }, [])

  const settleRun = useCallback((stepId: PipelineStepId) => {
    invokeSettledRef.current.add(stepId)
  }, [])

  useEffect(() => {
    if (runningStepIds.length === 0) {
      pollCountRef.current = 0
      return
    }

    const intervalId = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current > MAX_POLLS) {
        showPipelineWarning(
          chunkIndex != null
            ? 'This chunk step may still be running. Refresh the page or run the step again.'
            : 'One or more steps may still be running. Refresh the page or run the step again.'
        )
        setActionMessage(null)
        stopPolling()
        return
      }
      void onRefresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [runningStepIds.length, onRefresh, stopPolling, chunkIndex])

  useEffect(() => {
    if (runningStepIds.length === 0) return

    const finished: PipelineStepId[] = []

    for (const stepId of runningStepIds) {
      const baseline = runBaselinesRef.current.get(stepId)
      if (!baseline) continue

      const refreshCount = (payloadRefreshCountsRef.current.get(stepId) ?? 0) + 1
      payloadRefreshCountsRef.current.set(stepId, refreshCount)

      const snapshot = resolveSnapshot(stepId, payload)
      const snapshotChanged = snapshot !== baseline.snapshot
      const complete = stepComplete(stepId, payload)
      const blocked = stepBlocked(stepId, payload)
      const terminal = complete || blocked
      const becameTerminal =
        (complete && !baseline.complete) || (blocked && !baseline.blocked)
      const rerunSettled =
        terminal && baseline.complete && refreshCount >= RERUN_DONE_POLL_THRESHOLD
      const invokeSettled = invokeSettledRef.current.has(stepId)

      if (chunkIndex != null) {
        const runSettled = isChunkStepRunInvokeSettled(
          payload,
          stepId,
          chunkIndex,
          baseline.startedAtMs
        )
        if (runSettled || invokeSettled) {
          finished.push(stepId)
          continue
        }
      }

      if ((terminal && snapshotChanged) || becameTerminal || rerunSettled) {
        finished.push(stepId)
      }
    }

    if (finished.length === 0) return

    for (const stepId of finished) {
      runBaselinesRef.current.delete(stepId)
      payloadRefreshCountsRef.current.delete(stepId)
      invokeSettledRef.current.delete(stepId)
    }
    setRunningStepIds((prev) => prev.filter((id) => !finished.includes(id)))
    setActionMessage(null)
  }, [payload, runningStepIds, chunkIndex, resolveSnapshot, stepBlocked, stepComplete])

  const beginRun = useCallback(
    (stepId: PipelineStepId) => {
      runBaselinesRef.current.set(stepId, {
        snapshot: resolveSnapshot(stepId, payload),
        complete: stepComplete(stepId, payload),
        blocked: stepBlocked(stepId, payload),
        startedAtMs: Date.now(),
      })
      payloadRefreshCountsRef.current.set(stepId, 0)
      invokeSettledRef.current.delete(stepId)
      setRunningStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
      setActionMessage(null)
    },
    [payload, resolveSnapshot, stepBlocked, stepComplete]
  )

  const cancelRun = useCallback(
    (stepId?: PipelineStepId) => {
      if (stepId) {
        clearRunningStep(stepId)
        return
      }
      stopPolling()
    },
    [clearRunningStep, stopPolling]
  )

  return {
    runningStepIds,
    isStepRunning,
    actionMessage,
    setActionMessage,
    beginRun,
    cancelRun,
    settleRun,
    stopPolling,
  }
}
