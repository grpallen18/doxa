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

export function formatStoryStepRunProgress(run: StoryStepLatestRow): string {
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

export function resolvePipelineStepProgressFromRunLog(
  payload: StoryExtractionReviewPayload,
  stepId: PipelineStepId
): string | null {
  const run = getStoryStepRunRow(payload, stepId)
  if (!run) return null
  return formatStoryStepRunProgress(run)
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
