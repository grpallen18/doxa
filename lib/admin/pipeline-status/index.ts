import {
  PIPELINE_STAGES,
  PIPELINE_STEPS,
  type PipelineStageId,
  type PipelineStepId,
} from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  canonicalSnapshot,
  canonicalStepProgress,
  getCanonicalNotRequiredMessage,
  isCanonicalStepBlocked,
  isCanonicalStepComplete,
} from '@/lib/admin/pipeline-status/canonical'
import {
  canRunExtractionWhenBlocked,
  extractionSnapshot,
  extractionStepProgress,
  getExtractionBlockedReason,
  getExtractionNotRequiredMessage,
  isExtractionPipelineBlocked,
  isExtractionStageComplete,
  isExtractionStepBlocked,
  isExtractionStepComplete,
  isChunkReviewApproved,
  isMergeValidated,
  isRefineOptional,
} from '@/lib/admin/pipeline-status/extraction'

export {
  EXTRACTION_STEP_GROUPS,
  EXTRACTION_TIMELINE_HIDDEN_STEPS,
} from '@/lib/admin/pipeline-status/extraction-groups'
export {
  extractTimelineDetail,
  getExtractTimelineStatus,
  getMergeTimelineStatus,
  isChunkReviewApproved,
  isExtractionStageComplete,
  mergeTimelineDetail,
} from '@/lib/admin/pipeline-status/extraction'
import {
  getIngestionNotRequiredMessage,
  ingestionSnapshot,
  ingestionStepProgress,
  isIngestionStepBlocked,
  isIngestionStepComplete,
  isReviewPendingOptional,
} from '@/lib/admin/pipeline-status/ingestion'

export { getQualifyTimelineStatus, isQualifyResolved } from '@/lib/admin/pipeline-status/ingestion'

export type PipelineStepStatus = 'complete' | 'current' | 'pending' | 'blocked' | 'optional'

export type PipelineStepState = {
  id: PipelineStepId
  deployName: string
  label: string
  stageId: string
  stageLabel: string
  status: PipelineStepStatus
  progress: string | null
  runnable: boolean
  manifestStatus: string
  inactiveNote: string | null
}

export type PipelineChecklist = {
  stages: typeof PIPELINE_STAGES
  steps: PipelineStepState[]
  blockedReason: string | null
  isPipelineBlocked: boolean
}

const INGESTION_STEPS = new Set([
  'relevance-gate',
  'scrape-story-content',
  'clean-scraped-content',
  'review-pending-stories',
])

const EXTRACTION_STEPS = new Set([
  'chunk-story-bodies',
  'extract-story-claims',
  'validate-chunk-claims',
  'merge-story-claims',
  'review-merged-extraction',
  'refine-merged-extraction',
  'validate-merged-extraction',
])

const CANONICAL_STEPS = new Set([
  'link-canonical-claims',
  'link-canonical-events',
  'link-canonical-positions',
  'update-stances',
])

export function isStepComplete(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (INGESTION_STEPS.has(stepId)) return isIngestionStepComplete(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return isExtractionStepComplete(stepId, payload)
  if (CANONICAL_STEPS.has(stepId)) return isCanonicalStepComplete(stepId, payload)
  return false
}

export function isStepBlocked(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (INGESTION_STEPS.has(stepId)) return isIngestionStepBlocked(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return isExtractionStepBlocked(stepId, payload)
  if (CANONICAL_STEPS.has(stepId)) return isCanonicalStepBlocked(stepId, payload)
  return false
}

export function getStepNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  return (
    getIngestionNotRequiredMessage(stepId, payload) ??
    getExtractionNotRequiredMessage(stepId, payload) ??
    getCanonicalNotRequiredMessage(stepId, payload)
  )
}

export function isPipelineBlocked(payload: StoryExtractionReviewPayload): boolean {
  return isExtractionPipelineBlocked(payload)
}

export function getBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  return getExtractionBlockedReason(payload)
}

function stepProgress(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): string | null {
  if (INGESTION_STEPS.has(stepId)) return ingestionStepProgress(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return extractionStepProgress(stepId, payload)
  if (CANONICAL_STEPS.has(stepId)) return canonicalStepProgress(stepId, payload)
  return null
}

function isStepOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'review-pending-stories') return isReviewPendingOptional(payload)
  if (stepId === 'refine-merged-extraction') return isRefineOptional(stepId, payload)
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (def?.optional && isMergeValidated(payload)) return true
  return false
}

function priorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const idx = PIPELINE_STEPS.findIndex((s) => s.id === stepId)
  for (let i = 0; i < idx; i++) {
    const sid = PIPELINE_STEPS[i].id
    if (isStepComplete(sid, payload)) continue
    if (isStepOptional(sid, payload)) continue
    if (PIPELINE_STEPS[i].optional) continue
    return false
  }
  return true
}

function canRunWhenBlocked(stepId: PipelineStepId): boolean {
  return canRunExtractionWhenBlocked(stepId)
}

function isRunnable(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (!def) return false

  const complete = isStepComplete(stepId, payload)
  const blocked = isStepBlocked(stepId, payload)
  const priorOk = priorStepsSatisfied(stepId, payload)
  const pipelineBlocked = isPipelineBlocked(payload)
  const blockedGate = pipelineBlocked && !canRunWhenBlocked(stepId)

  if (stepId === 'review-pending-stories') {
    return !complete && payload.story.relevance_status === 'PENDING' && priorOk
  }

  if (stepId === 'scrape-story-content' || stepId === 'clean-scraped-content') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      payload.story.relevance_status === 'KEEP'
    )
  }

  if (stepId === 'merge-story-claims') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      isChunkReviewApproved(payload)
    )
  }

  return (
    !complete &&
    !blocked &&
    priorOk &&
    !blockedGate &&
    !(def.optional && !isMergeValidated(payload))
  )
}

export function derivePipelineChecklist(payload: StoryExtractionReviewPayload): PipelineChecklist {
  const blockedReason = getBlockedReason(payload)
  const pipelineBlocked = isPipelineBlocked(payload)

  let foundCurrent = false
  const steps: PipelineStepState[] = PIPELINE_STEPS.map((def) => {
    const complete = isStepComplete(def.id, payload)
    const blocked = isStepBlocked(def.id, payload)
    const optional = isStepOptional(def.id, payload)
    const progress = stepProgress(def.id, payload)

    let status: PipelineStepStatus
    if (blocked && !complete) {
      status = 'blocked'
    } else if (complete) {
      status = 'complete'
    } else if (optional && def.optional) {
      status = 'optional'
    } else if (optional) {
      status = 'optional'
    } else if (!foundCurrent) {
      status = 'current'
      foundCurrent = true
    } else {
      status = 'pending'
    }

    return {
      id: def.id,
      deployName: def.deployName,
      label: def.label,
      stageId: def.stageId,
      stageLabel: def.stageLabel,
      status,
      progress,
      runnable: isRunnable(def.id, payload),
      manifestStatus: def.manifestStatus,
      inactiveNote: def.inactiveNote,
    }
  })

  return { stages: PIPELINE_STAGES, steps, blockedReason, isPipelineBlocked: pipelineBlocked }
}

export function isStepDoneAfterRun(
  stepId: PipelineStepId,
  before: StoryExtractionReviewPayload,
  after: StoryExtractionReviewPayload
): boolean {
  if (isStepComplete(stepId, after)) return true
  if (isStepBlocked(stepId, after)) return true
  return (
    JSON.stringify(snapshotForStep(stepId, before)) !== JSON.stringify(snapshotForStep(stepId, after))
  )
}

function snapshotForStep(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  if (INGESTION_STEPS.has(stepId)) return ingestionSnapshot(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return extractionSnapshot(stepId, payload)
  if (CANONICAL_STEPS.has(stepId)) return canonicalSnapshot(stepId, payload)
  return { stepId }
}

export function getStepOutputSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  return snapshotForStep(stepId, payload)
}

export type StageSummaryStatus = 'complete' | 'current' | 'blocked' | 'pending'

export type StageSummary = {
  stageId: PipelineStageId
  label: string
  status: StageSummaryStatus
  href: string
}

const STAGE_PATH: Record<PipelineStageId, string> = {
  ingestion: 'ingestion',
  extraction: 'extraction',
  canonical: 'canonical',
}

export function deriveStageSummaries(
  storyId: string,
  payload: StoryExtractionReviewPayload
): StageSummary[] {
  const checklist = derivePipelineChecklist(payload)
  let foundCurrent = false

  return PIPELINE_STAGES.map((stage) => {
    const stageSteps = checklist.steps.filter((s) => s.stageId === stage.id)
    const hasBlocked = stageSteps.some((s) => s.status === 'blocked')

    let allDone: boolean
    if (stage.id === 'extraction') {
      allDone = isExtractionStageComplete(payload)
    } else {
      allDone = stageSteps.every((s) => s.status === 'complete' || s.status === 'optional')
    }

    let status: StageSummaryStatus
    if (hasBlocked) {
      status = 'blocked'
    } else if (allDone && stageSteps.length > 0) {
      status = 'complete'
    } else if (!foundCurrent) {
      status = 'current'
      foundCurrent = true
    } else {
      status = 'pending'
    }

    return {
      stageId: stage.id,
      label: stage.label,
      status,
      href: `/admin/stories/${storyId}/${STAGE_PATH[stage.id]}`,
    }
  })
}
