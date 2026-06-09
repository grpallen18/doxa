'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  getStepOutputSnapshot,
  isStepBlocked,
  isStepComplete,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { pipelineStepHasDetailContent } from '@/components/admin/pipeline/pipeline-step-details'
import { STEP_DETAIL_REVEAL_DURATION_MS } from '@/components/admin/pipeline/step-detail-reveal'
import { showPipelineWarning } from '@/lib/admin/pipeline-toast'

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 36
const RERUN_DONE_POLL_THRESHOLD = 2

type StepRunBaseline = {
  snapshot: string
  complete: boolean
  blocked: boolean
}

export function usePipelineStepPoll({
  payload,
  onRefresh,
}: {
  payload: StoryExtractionReviewPayload
  onRefresh: () => Promise<void>
}) {
  const [runningStepIds, setRunningStepIds] = useState<PipelineStepId[]>([])
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [revealTarget, setRevealTarget] = useState<{ stepId: PipelineStepId; epoch: number } | null>(
    null
  )
  const pollCountRef = useRef(0)
  const runBaselinesRef = useRef<Map<PipelineStepId, StepRunBaseline>>(new Map())
  const payloadRefreshCountsRef = useRef<Map<PipelineStepId, number>>(new Map())

  const isStepRunning = useCallback(
    (stepId: PipelineStepId) => runningStepIds.includes(stepId),
    [runningStepIds]
  )

  const clearRunningStep = useCallback((stepId: PipelineStepId) => {
    runBaselinesRef.current.delete(stepId)
    payloadRefreshCountsRef.current.delete(stepId)
    setRunningStepIds((prev) => prev.filter((id) => id !== stepId))
  }, [])

  const stopPolling = useCallback(() => {
    runBaselinesRef.current.clear()
    payloadRefreshCountsRef.current.clear()
    setRunningStepIds([])
    pollCountRef.current = 0
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
          'One or more steps may still be running. Refresh the page or run the step again.'
        )
        setActionMessage(null)
        stopPolling()
        return
      }
      void onRefresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [runningStepIds.length, onRefresh, stopPolling])

  useEffect(() => {
    if (runningStepIds.length === 0) return

    const finished: PipelineStepId[] = []
    let latestReveal: { stepId: PipelineStepId; epoch: number } | null = null

    for (const stepId of runningStepIds) {
      const baseline = runBaselinesRef.current.get(stepId)
      if (!baseline) continue

      const refreshCount = (payloadRefreshCountsRef.current.get(stepId) ?? 0) + 1
      payloadRefreshCountsRef.current.set(stepId, refreshCount)

      const snapshot = JSON.stringify(getStepOutputSnapshot(stepId, payload))
      const snapshotChanged = snapshot !== baseline.snapshot
      const complete = isStepComplete(stepId, payload)
      const blocked = isStepBlocked(stepId, payload)
      const terminal = complete || blocked
      const becameTerminal =
        (complete && !baseline.complete) || (blocked && !baseline.blocked)
      const rerunSettled =
        terminal && baseline.complete && refreshCount >= RERUN_DONE_POLL_THRESHOLD

      if ((terminal && snapshotChanged) || becameTerminal || rerunSettled) {
        finished.push(stepId)
        if (snapshotChanged && pipelineStepHasDetailContent(stepId, payload)) {
          latestReveal = { stepId, epoch: Date.now() }
        }
      }
    }

    if (finished.length === 0) return

    for (const stepId of finished) {
      runBaselinesRef.current.delete(stepId)
      payloadRefreshCountsRef.current.delete(stepId)
    }
    setRunningStepIds((prev) => prev.filter((id) => !finished.includes(id)))
    if (latestReveal) setRevealTarget(latestReveal)
    setActionMessage(null)
  }, [payload, runningStepIds])

  useEffect(() => {
    if (!revealTarget) return
    const timeoutId = setTimeout(() => setRevealTarget(null), STEP_DETAIL_REVEAL_DURATION_MS + 150)
    return () => clearTimeout(timeoutId)
  }, [revealTarget])

  const beginRun = useCallback(
    (stepId: PipelineStepId) => {
      runBaselinesRef.current.set(stepId, {
        snapshot: JSON.stringify(getStepOutputSnapshot(stepId, payload)),
        complete: isStepComplete(stepId, payload),
        blocked: isStepBlocked(stepId, payload),
      })
      payloadRefreshCountsRef.current.set(stepId, 0)
      setRunningStepIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
      setRevealTarget(null)
      setActionMessage(null)
    },
    [payload]
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
    revealTarget,
    beginRun,
    cancelRun,
    stopPolling,
  }
}
