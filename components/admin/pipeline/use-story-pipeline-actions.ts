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
  showPipelineInfo,
  showPipelineSuccess,
  showPipelineWarning,
} from '@/lib/admin/pipeline-toast'
import type { PipelineWarning } from '@/lib/admin/pipeline-warnings'

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
    isStepRunning,
    actionMessage,
    setActionMessage,
    revealTarget,
    beginRun,
    cancelRun,
  } = usePipelineStepPoll({ payload, onRefresh })

  const syncPromptSchema = useCallback(async (stepId: string) => {
    try {
      const res = await fetch(`/api/admin/agents/${stepId}/prompt/sync-schema`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        showPipelineError(json.error?.message ?? 'Failed to sync response schema')
        return
      }
      showPipelineSuccess(
        `Response schema synced from prompt OUTPUT (v${json.data?.promptVersionNumber ?? '?'}). Takes effect on the next run (within ~60s).`
      )
    } catch {
      showPipelineError('Failed to sync response schema')
    }
  }, [])

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
          cancelRun(stepId)
          return
        }

        const data = json.data as {
          prompt_version_number?: number | null
          warnings?: PipelineWarning[]
        } | null
        if (data?.prompt_version_number != null) {
          showPipelineInfo(`Running with prompt v${data.prompt_version_number}`)
        }
        for (const warning of data?.warnings ?? []) {
          showPipelineWarning(warning, { onFixSchema: syncPromptSchema })
        }

        void onRefresh()
      } catch {
        const message = 'Failed to invoke pipeline step'
        setStepError(message)
        showPipelineError(message)
        cancelRun(stepId)
      }
    },
    [storyId, onRefresh, beginRun, cancelRun, setActionMessage, syncPromptSchema]
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
    isStepRunning,
    revertingStepId,
    revertTarget,
    stepError,
    actionMessage,
    revealTarget,
    expanded,
    setExpanded,
    runStep,
    requestRevert,
    cancelRevert,
    confirmRevert,
    getRevertStepDescription,
  }
}
