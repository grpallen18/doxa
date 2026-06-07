'use client'

import { useCallback, useEffect, useState } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  getRevertStepDescription,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { usePipelineStepPoll } from '@/components/admin/pipeline/use-pipeline-step-poll'

export function useStoryPipelineActions({
  storyId,
  payload,
  onRefresh,
}: {
  storyId: string
  payload: StoryExtractionReviewPayload
  onRefresh: () => Promise<void>
}) {
  const [stepError, setStepError] = useState<string | null>(null)
  const [revertingStepId, setRevertingStepId] = useState<PipelineStepId | null>(null)
  const [revertTarget, setRevertTarget] = useState<PipelineStepId | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const {
    runningStepId,
    actionMessage,
    setActionMessage,
    revealTarget,
    beginRun,
    cancelRun,
  } = usePipelineStepPoll({ payload, onRefresh })

  const isBusy = runningStepId != null || revertingStepId != null

  const runStep = useCallback(
    async (stepId: PipelineStepId) => {
      setStepError(null)
      setActionMessage(null)
      beginRun(stepId)
      setExpanded((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
      try {
        const res = await fetch(`/api/admin/stories/${storyId}/run-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: stepId }),
        })
        const json = await res.json()
        if (!res.ok) {
          setStepError(json.error?.message ?? 'Step failed to start')
          cancelRun()
          return
        }
        void onRefresh()
      } catch {
        setStepError('Failed to invoke pipeline step')
        cancelRun()
      }
    },
    [storyId, onRefresh, beginRun, cancelRun, setActionMessage]
  )

  const revertStep = useCallback(
    async (stepId: PipelineStepId) => {
      setStepError(null)
      setActionMessage(null)
      setRevertingStepId(stepId)
      setRevertTarget(null)
      try {
        const res = await fetch(`/api/admin/stories/${storyId}/revert-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: stepId, confirm: true }),
        })
        const json = await res.json()
        if (!res.ok) {
          setStepError(json.error?.message ?? 'Revert failed')
          return
        }
        setActionMessage(`Reverted ${stepId.replace(/-/g, ' ')}`)
        await onRefresh()
      } catch {
        setStepError('Failed to revert pipeline step')
      } finally {
        setRevertingStepId(null)
      }
    },
    [storyId, onRefresh, setActionMessage]
  )

  const requestRevert = useCallback((stepId: PipelineStepId) => {
    setRevertTarget(stepId)
  }, [])

  const cancelRevert = useCallback(() => {
    setRevertTarget(null)
  }, [])

  const confirmRevert = useCallback(() => {
    if (revertTarget) void revertStep(revertTarget)
  }, [revertTarget, revertStep])

  useEffect(() => {
    if (!revealTarget) return
    setExpanded((prev) =>
      prev.includes(revealTarget.stepId) ? prev : [...prev, revealTarget.stepId]
    )
  }, [revealTarget])

  return {
    runningStepId,
    revertingStepId,
    revertTarget,
    stepError,
    actionMessage,
    revealTarget,
    expanded,
    setExpanded,
    isBusy,
    runStep,
    requestRevert,
    cancelRevert,
    confirmRevert,
    getRevertStepDescription,
  }
}
