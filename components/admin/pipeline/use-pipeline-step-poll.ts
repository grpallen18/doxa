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

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 36

export function usePipelineStepPoll({
  payload,
  onRefresh,
}: {
  payload: StoryExtractionReviewPayload
  onRefresh: () => Promise<void>
}) {
  const [runningStepId, setRunningStepId] = useState<PipelineStepId | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [revealTarget, setRevealTarget] = useState<{ stepId: PipelineStepId; epoch: number } | null>(
    null
  )
  const pollCountRef = useRef(0)
  const runBaselineRef = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    setRunningStepId(null)
    pollCountRef.current = 0
  }, [])

  useEffect(() => {
    if (!runningStepId) return

    pollCountRef.current = 0
    const intervalId = setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current > MAX_POLLS) {
        setActionMessage('Step may still be running. Refresh the page or run the step again.')
        runBaselineRef.current = null
        stopPolling()
        return
      }
      void onRefresh()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [runningStepId, onRefresh, stopPolling])

  useEffect(() => {
    if (!runningStepId) return

    const snapshot = JSON.stringify(getStepOutputSnapshot(runningStepId, payload))
    const snapshotChanged = runBaselineRef.current != null && snapshot !== runBaselineRef.current
    const hasContent = pipelineStepHasDetailContent(runningStepId, payload)
    const done = isStepComplete(runningStepId, payload) || isStepBlocked(runningStepId, payload)

    if (done && hasContent && snapshotChanged) {
      setRevealTarget({ stepId: runningStepId, epoch: Date.now() })
      runBaselineRef.current = null
      setActionMessage(null)
      stopPolling()
    }
  }, [payload, runningStepId, stopPolling])

  useEffect(() => {
    if (!revealTarget) return
    const timeoutId = setTimeout(() => setRevealTarget(null), STEP_DETAIL_REVEAL_DURATION_MS + 150)
    return () => clearTimeout(timeoutId)
  }, [revealTarget])

  const beginRun = useCallback((stepId: PipelineStepId) => {
    runBaselineRef.current = JSON.stringify(getStepOutputSnapshot(stepId, payload))
    setRunningStepId(stepId)
    setRevealTarget(null)
    setActionMessage(null)
  }, [payload])

  const cancelRun = useCallback(() => {
    setRunningStepId(null)
    runBaselineRef.current = null
  }, [])

  return {
    runningStepId,
    actionMessage,
    setActionMessage,
    revealTarget,
    beginRun,
    cancelRun,
    stopPolling,
  }
}
