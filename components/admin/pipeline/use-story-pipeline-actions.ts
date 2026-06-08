'use client'

import { useCallback, useEffect, useState } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  getRevertStepDescription,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import { usePipelineStepPoll } from '@/components/admin/pipeline/use-pipeline-step-poll'
import {
  showPipelineError,
  showPipelineSuccess,
} from '@/lib/admin/pipeline-toast'

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
          const message = json.error?.message ?? 'Step failed to start'
          const deployName = json.error?.deploy_name as string | undefined
          setStepError(message)
          showPipelineError(message, deployName)
          cancelRun()
          return
        }
        void onRefresh()
      } catch {
        const message = 'Failed to invoke pipeline step'
        setStepError(message)
        showPipelineError(message)
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
          const message = json.error?.message ?? 'Revert failed'
          setStepError(message)
          showPipelineError(message)
          return
        }
        showPipelineSuccess(`Reverted ${stepId.replace(/-/g, ' ')}`)
        setActionMessage(null)
        await onRefresh()
      } catch {
        const message = 'Failed to revert pipeline step'
        setStepError(message)
        showPipelineError(message)
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
