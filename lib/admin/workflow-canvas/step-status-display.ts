import {
  isIngestionStepExecuted,
  isReviewPendingOptional,
} from '@/lib/admin/pipeline-status/ingestion'
import type { PipelineStepState } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type {
  AgentDisplayStatus,
  VisionDecisionMode,
  VisionMaturity,
  VisionNodeType,
} from '@/lib/admin/workflow-canvas/types'

export function mapStepToDisplayStatus(
  step: PipelineStepState | undefined,
  isRunning: boolean
): AgentDisplayStatus {
  if (isRunning) return 'Running'
  if (!step) return 'Ready'

  switch (step.status) {
    case 'complete':
    case 'optional':
      return 'Approved'
    case 'running':
      return 'Running'
    case 'blocked':
      return 'Failed'
    case 'current':
      return 'Needs Review'
    case 'pending':
    default:
      return 'Ready'
  }
}

export function mapDecisionResult(
  step: PipelineStepState | undefined,
  isRunning: boolean
): string {
  if (isRunning) return ''
  if (!step) return ''
  if (step.status === 'complete' || step.status === 'optional') return 'Pass'
  if (step.status === 'blocked') return 'Fail'
  if (step.status === 'current') return 'Needs Refinement'
  return ''
}

export function mapQualifyDecisionResult(
  payload: StoryExtractionReviewPayload,
  isRunning: boolean
): string {
  if (isRunning) return ''
  const status = payload.story.relevance_status
  if (!status) return ''
  if (status === 'KEEP') return 'Keep'
  if (status === 'DROP') return 'Drop'
  if (status === 'PENDING') return 'Pending'
  return ''
}

export function mapApprovalDecisionResult(
  payload: StoryExtractionReviewPayload,
  _step: PipelineStepState | undefined,
  isRunning: boolean
): string {
  if (isRunning) return ''

  const status = payload.story.relevance_status
  const reviewExecuted = isIngestionStepExecuted('review-pending-stories', payload)

  if (isReviewPendingOptional(payload) && !reviewExecuted) {
    return 'N/A'
  }

  if (status === 'PENDING') {
    return 'Awaiting review'
  }
  if (status === 'KEEP') return 'Keep'
  if (status === 'DROP') return 'Drop'
  return ''
}

export function mapAgentNodeStatus({
  nodeType,
  maturity,
  decisionMode,
  payload,
  step,
  running,
}: {
  nodeType: VisionNodeType
  maturity: VisionMaturity
  decisionMode?: VisionDecisionMode
  payload: StoryExtractionReviewPayload
  step: PipelineStepState | undefined
  running: boolean
}): string {
  if (running) return 'Running'
  if (maturity !== 'live') return 'Planned'

  if (decisionMode === 'qualify') {
    return mapQualifyDecisionResult(payload, running) || mapStepToDisplayStatus(step, running)
  }
  if (decisionMode === 'approval') {
    return (
      mapApprovalDecisionResult(payload, step, running) || mapStepToDisplayStatus(step, running)
    )
  }
  if (nodeType === 'decision') {
    return mapDecisionResult(step, running) || mapStepToDisplayStatus(step, running)
  }
  return mapStepToDisplayStatus(step, running)
}
