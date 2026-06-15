'use client'

import { useCallback, useState } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  getRevertStepDescription,
  derivePipelineChecklist,
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
import { getChunkScopedStepSnapshot } from '@/lib/admin/pipeline-status/chunk-step-runnable'
import {
  formatPipelineDebugTraceSummary,
  isPipelineDebugTrace,
} from '@/lib/admin/pipeline-debug-trace'

export function useChunkPipelineActions({
  storyId,
  chunkIndex,
  payload,
  onRefresh,
}: {
  storyId: string
  chunkIndex: number
  payload: StoryExtractionReviewPayload
  onRefresh: () => Promise<void>
}) {
  const [stepError, setStepError] = useState<string | null>(null)
  const [revertingStepId, setRevertingStepId] = useState<PipelineStepId | null>(null)
  const [revertTarget, setRevertTarget] = useState<PipelineStepId | null>(null)
  const chunkStepStatus = useCallback(
    (stepId: PipelineStepId, p: StoryExtractionReviewPayload) =>
      derivePipelineChecklist(p, { scope: 'chunk', chunkIndex }).steps.find((s) => s.id === stepId)
        ?.status,
    [chunkIndex]
  )

  const {
    isStepRunning,
    actionMessage,
    setActionMessage,
    beginRun,
    cancelRun,
    settleRun,
  } = usePipelineStepPoll({
    payload,
    chunkIndex,
    onRefresh,
    getStepSnapshot: (stepId, p) =>
      JSON.stringify(getChunkScopedStepSnapshot(stepId, p, chunkIndex)),
    resolveStepComplete: (stepId, p) => {
      const status = chunkStepStatus(stepId, p)
      return status === 'complete' || status === 'optional'
    },
    resolveStepBlocked: (stepId, p) => chunkStepStatus(stepId, p) === 'blocked',
  })

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
      try {
        const res = await fetch(`/api/admin/stories/${storyId}/run-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: stepId, chunk_index: chunkIndex }),
        })
        const json = await res.json()
        if (!res.ok) {
          const message = json.error?.message ?? 'Step failed to start'
          const deployName = json.error?.deploy_name as string | undefined
          const errorCode = json.error?.error_code as string | undefined
          const failedTrace =
            isPipelineDebugTrace(json.error?.chunk_debug_trace)
              ? json.error.chunk_debug_trace
              : isPipelineDebugTrace(json.error?.debug_trace)
                ? json.error.debug_trace
                : null
          if (failedTrace) {
            console.error(`[${stepId} trace]`, failedTrace)
            showPipelineInfo(formatPipelineDebugTraceSummary(failedTrace))
          }
          const detail = errorCode ? `${message} (${errorCode})` : message
          setStepError(detail)
          showPipelineError(detail, deployName)
          cancelRun(stepId)
          return
        }

        const data = json.data as {
          prompt_version_number?: number | null
          warnings?: PipelineWarning[]
          result?: {
            ok?: boolean
            processed?: number
            message?: string
            error?: string
            error_code?: string
            debug_trace?: unknown
            chunk_debug_trace?: unknown
          }
        } | null

        const result = data?.result
        const invokeTrace = isPipelineDebugTrace(result?.debug_trace) ? result.debug_trace : null
        const chunkTrace = isPipelineDebugTrace(result?.chunk_debug_trace)
          ? result.chunk_debug_trace
          : null
        const traceForDisplay = chunkTrace ?? invokeTrace
        if (traceForDisplay) {
          console.info(`[${stepId} trace]`, traceForDisplay)
          showPipelineInfo(formatPipelineDebugTraceSummary(traceForDisplay))
        }

        const processed =
          typeof result?.processed === 'number' ? result.processed : null
        const resultFailed = result?.ok === false
        const hasTraceFailure = traceForDisplay?.steps.some((s) => s.status === 'fail') ?? false

        if (resultFailed || (processed === 0 && hasTraceFailure)) {
          const message =
            typeof result?.error === 'string' && result.error.trim()
              ? result.error
              : typeof result?.message === 'string' && result.message.trim()
                ? result.message
                : 'Step preconditions failed for this chunk.'
          const errorCode =
            typeof result?.error_code === 'string' ? result.error_code : undefined
          const detail = errorCode ? `${message} (${errorCode})` : message
          setStepError(detail)
          showPipelineWarning(detail)
        } else if (processed === 0) {
          const message =
            typeof result?.message === 'string' && result.message.trim()
              ? result.message
              : 'Step did not process this chunk (queue empty or already complete).'
          showPipelineWarning(message)
        }

        if (data?.prompt_version_number != null) {
          showPipelineInfo(`Running with prompt v${data.prompt_version_number}`)
        }
        for (const warning of data?.warnings ?? []) {
          showPipelineWarning(warning, { onFixSchema: syncPromptSchema })
        }

        void onRefresh().finally(() => {
          settleRun(stepId)
        })
      } catch {
        const message = 'Failed to invoke pipeline step'
        setStepError(message)
        showPipelineError(message)
        cancelRun(stepId)
      }
    },
    [storyId, chunkIndex, onRefresh, beginRun, cancelRun, settleRun, setActionMessage, syncPromptSchema]
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
          body: JSON.stringify({ step: stepId, confirm: true, chunk_index: chunkIndex }),
        })
        const json = await res.json()
        if (!res.ok) {
          const message = json.error?.message ?? 'Revert failed'
          setStepError(message)
          showPipelineError(message)
          return
        }
        showPipelineSuccess(`Reverted ${stepId.replace(/-/g, ' ')} for chunk ${chunkIndex}`)
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
    [storyId, chunkIndex, onRefresh, setActionMessage]
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

  return {
    isStepRunning,
    revertingStepId,
    revertTarget,
    stepError,
    actionMessage,
    runStep,
    requestRevert,
    cancelRevert,
    confirmRevert,
    getRevertStepDescription,
  }
}

export type ChunkPipelineActions = ReturnType<typeof useChunkPipelineActions>
