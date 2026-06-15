import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepStatus } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  STORY_STEP_OUTCOME_LABELS,
  type StoryStepLatestRow,
  type StoryStepOutcome,
} from '@/lib/admin/story-step-runs'
import type { AgentDisplayStatus } from '@/lib/admin/workflow-canvas/types'

export function getStoryStepRunRow(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): StoryStepLatestRow | null {
  return payload.step_runs?.[stepId] ?? null
}

export function mapStoryStepOutcomeToPipelineStatus(
  outcome: StoryStepOutcome
): PipelineStepStatus {
  switch (outcome) {
    case 'success':
      return 'complete'
    case 'failure':
      return 'blocked'
    case 'looping':
      return 'current'
    case 'skipped':
      return 'optional'
    case 'no_op':
      return 'pending'
    default:
      return 'pending'
  }
}

export function mapStoryStepOutcomeToAgentDisplayStatus(
  outcome: StoryStepOutcome,
  stepId?: PipelineStepId
): AgentDisplayStatus {
  switch (outcome) {
    case 'success':
      return 'Approved'
    case 'failure':
      return 'Failed'
    case 'skipped':
      return 'N/A'
    case 'no_op':
      return 'Ready'
    case 'looping':
      if (stepId?.includes('refine')) return 'Refining'
      if (stepId?.startsWith('extract')) return 'Running'
      if (stepId?.startsWith('validate')) return 'Needs Review'
      return 'Needs Review'
    default:
      return 'Ready'
  }
}

export function formatChunksCreatedLabel(count: number): string {
  return `${count} chunk${count === 1 ? '' : 's'} created`
}

export function formatStoryStepRunProgress(
  run: StoryStepLatestRow,
  hints?: { chunkCount?: number }
): string {
  if (run.step_id === 'chunk-story-bodies') {
    const fromMeta = run.meta.chunks_created
    if (typeof fromMeta === 'number' && fromMeta >= 0) {
      return formatChunksCreatedLabel(fromMeta)
    }
    if (hints?.chunkCount != null && hints.chunkCount > 0) {
      return formatChunksCreatedLabel(hints.chunkCount)
    }
  }

  const label = STORY_STEP_OUTCOME_LABELS[run.outcome]
  const processed = run.meta.processed
  if (typeof processed === 'number' && processed > 0) {
    const chunks = run.meta.chunk_indices
    if (Array.isArray(chunks) && chunks.length > 0) {
      return `${label} · ${processed} chunk(s)`
    }
    return `${label} · processed ${processed}`
  }
  if (run.error) {
    const snippet = run.error.length > 72 ? `${run.error.slice(0, 72)}…` : run.error
    return `${label} · ${snippet}`
  }
  const message = run.meta.message
  if (typeof message === 'string' && message.trim()) {
    return `${label} · ${message}`
  }
  return label
}

export function resolvePipelineStepStatusFromRunLog(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): PipelineStepStatus | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run) return null
  return mapStoryStepOutcomeToPipelineStatus(run.outcome)
}

/** Log says the step finished successfully (terminal). */
export function isStoryStepRunLogComplete(run: StoryStepLatestRow | null): boolean {
  return run?.outcome === 'success' || run?.outcome === 'skipped'
}

/** Log says the step failed (terminal); Run should remain available to retry. */
export function isStoryStepRunLogFailed(run: StoryStepLatestRow | null): boolean {
  return run?.outcome === 'failure'
}

/** Dispatch/async in flight — block Run until domain catches up or log advances. */
export function isStoryStepRunInFlight(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  domainComplete: boolean,
  chunkIndex?: number
): boolean {
  const run = getStoryStepRunRow(payload, stepId)
  if (run?.outcome !== 'looping' || domainComplete) return false
  if (chunkIndex != null && run.chunk_index != null && run.chunk_index !== chunkIndex) {
    return false
  }
  return true
}

/** Edge invoke finished for this chunk — UI can stop spinning even if the lane is still mid-loop. */
export function isChunkStepRunInvokeSettled(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  chunkIndex: number,
  startedAtMs: number
): boolean {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run || run.chunk_index !== chunkIndex) return false

  const runAt = new Date(run.occurred_at).getTime()
  if (!Number.isFinite(runAt) || runAt < startedAtMs - 5_000) return false

  if (run.outcome === 'success' || run.outcome === 'failure' || run.outcome === 'no_op') {
    return true
  }

  // A fresh looping row means the handler returned but the lane did not advance (partial refine).
  return run.outcome === 'looping'
}

/** Checklist complete: terminal log success, or domain when log is absent / non-terminal. */
export function resolveChecklistStepComplete(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  domainComplete: boolean
): boolean {
  const run = getStoryStepRunRow(payload, stepId)
  if (isStoryStepRunLogComplete(run)) return true
  if (isStoryStepRunLogFailed(run)) return false
  if (run) return domainComplete
  return domainComplete
}

/** Display blocked: log failure, or domain gates (e.g. story dropped). */
export function resolveChecklistStepBlocked(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  domainBlocked: boolean
): boolean {
  const run = getStoryStepRunRow(payload, stepId)
  if (isStoryStepRunLogFailed(run)) return true
  if (isStoryStepRunLogComplete(run)) return false
  return domainBlocked
}

/**
 * Status from run log when a row exists; reconciles stale looping/no_op with domain completion
 * (e.g. scrape dispatch logged looping, receive callback updated stories.scraped_at).
 */
export function resolveChecklistStepStatus(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  domainComplete: boolean
): PipelineStepStatus | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run) return null
  switch (run.outcome) {
    case 'success':
      return 'complete'
    case 'skipped':
      return 'optional'
    case 'failure':
      return 'blocked'
    case 'looping':
      return domainComplete ? 'complete' : 'current'
    case 'no_op':
      return domainComplete ? 'complete' : 'pending'
    default:
      return null
  }
}

export function resolveChecklistStepProgress(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId,
  domainComplete: boolean
): string | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run) return null
  if (
    domainComplete &&
    (run.outcome === 'looping' || run.outcome === 'no_op')
  ) {
    return null
  }
  return formatStoryStepRunProgress(run, { chunkCount: payload.chunks.length })
}

export function resolvePipelineStepProgressFromRunLog(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): string | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run) return null
  return formatStoryStepRunProgress(run, { chunkCount: payload.chunks.length })
}

export function getStoryStepRunCompletedAt(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): string | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run || run.outcome !== 'success') return null
  return run.ended_at ?? run.occurred_at
}

export function isStoryStepRunTerminalSuccess(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): boolean {
  return getStoryStepRunRow(payload, stepId)?.outcome === 'success'
}
