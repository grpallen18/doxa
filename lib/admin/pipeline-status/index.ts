import {
  PIPELINE_STAGES,
  PIPELINE_STEPS,
  type PipelineStageId,
  type PipelineStepId,
} from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  isStoryStepRunInFlight,
  resolveChecklistStepBlocked,
  resolveChecklistStepComplete,
  resolveChecklistStepProgress,
  resolveChecklistStepStatus,
} from '@/lib/admin/pipeline-step-run-display'
import {
  canRunExtractionWhenBlocked,
  extractionSnapshot,
  extractionStepProgress,
  getExtractionBlockedReason,
  getExtractionNotRequiredMessage,
  isExtractionLanePipelineBlocked,
  isExtractionPipelineBlocked,
  isExtractionStageComplete,
  isExtractionStepBlocked,
  isExtractionStepComplete,
  isChunkClaimsReviewComplete,
  isChunkClaimsReviewStarted,
  isChunkReviewApproved,
} from '@/lib/admin/pipeline-status/extraction'

export {
  CHUNK_PARALLEL_STEP_IDS,
  CLAIMS_LANE_STEP_IDS,
  EXTRACTION_PARALLEL_LANES,
  EXTRACTION_SHARED_STEP_IDS,
  EXTRACTION_STEP_GROUPS,
  EXTRACTION_TIMELINE_HIDDEN_STEPS,
  getExtractionLaneStepIds,
  getExtractionStepLane,
  isChunkParallelStep,
  MERGE_QA_STEP_IDS,
  POSITIONS_LANE_STEP_IDS,
} from '@/lib/admin/pipeline-status/extraction-groups'
import {
  CHUNK_PARALLEL_STEP_IDS,
  CLAIMS_LANE_STEP_IDS,
  getExtractionLaneStepIds,
  getExtractionStepLane,
  isChunkParallelStep,
} from '@/lib/admin/pipeline-status/extraction-groups'
import { chunkParallelStepProgress } from '@/lib/admin/pipeline-status/chunk-parallel-progress'
import {
  chunkStepProgressLabel,
  isChunkStepDomainComplete,
  isChunkStepRunnable,
} from '@/lib/admin/pipeline-status/chunk-step-runnable'
export {
  extractTimelineDetail,
  getExtractTimelineStatus,
  getMergeTimelineStatus,
  isChunkClaimsReviewComplete,
  isChunkClaimsReviewStarted,
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
  isQualificationPipelineStep,
  isReviewPendingOptional,
  isStoryDropped,
  STORY_DROPPED_PROGRESS,
} from '@/lib/admin/pipeline-status/ingestion'

export {
  getQualifyTimelineStatus,
  isQualifyResolved,
  isStoryDropped,
  STORY_DROPPED_PROGRESS,
} from '@/lib/admin/pipeline-status/ingestion'

export type PipelineStepStatus =
  | 'complete'
  | 'current'
  | 'running'
  | 'pending'
  | 'blocked'
  | 'optional'

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

export type PipelineChecklistScope =
  | { scope: 'story' }
  | { scope: 'chunk'; chunkIndex: number }

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
  'refine-chunk-claims',
  'approve-chunk-claims',
])

function isStepCompleteDomain(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (INGESTION_STEPS.has(stepId)) return isIngestionStepComplete(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return isExtractionStepComplete(stepId, payload)
  return false
}

function isStepBlockedDomain(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) return true
  if (INGESTION_STEPS.has(stepId)) return isIngestionStepBlocked(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return isExtractionStepBlocked(stepId, payload)
  return false
}

export function isStepComplete(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  return resolveChecklistStepComplete(payload, stepId, isStepCompleteDomain(stepId, payload))
}

export function isStepBlocked(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  return resolveChecklistStepBlocked(payload, stepId, isStepBlockedDomain(stepId, payload))
}

export function getStepNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  return (
    getIngestionNotRequiredMessage(stepId, payload) ??
    getExtractionNotRequiredMessage(stepId, payload)
  )
}

export function isPipelineBlocked(payload: StoryExtractionReviewPayload): boolean {
  return isStoryDropped(payload) || isExtractionPipelineBlocked(payload)
}

export function getBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (isStoryDropped(payload)) return STORY_DROPPED_PROGRESS
  return getExtractionBlockedReason(payload)
}

function stepProgress(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): string | null {
  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) {
    return STORY_DROPPED_PROGRESS
  }
  if (INGESTION_STEPS.has(stepId)) return ingestionStepProgress(stepId, payload)
  if (EXTRACTION_STEPS.has(stepId)) return extractionStepProgress(stepId, payload)
  return null
}

function isStepOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'review-pending-stories') return isReviewPendingOptional(payload)
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  return def?.optional === true
}

function isPriorStepSatisfied(sid: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (isStepComplete(sid, payload)) return true
  if (isStepOptional(sid, payload)) return true
  return false
}

function stageStepIds(stageId: PipelineStageId): PipelineStepId[] {
  return (PIPELINE_STAGES.find((s) => s.id === stageId)?.stepIds ?? []) as PipelineStepId[]
}

function priorStepsInOrder(
  stepId: PipelineStepId,
  orderedStepIds: PipelineStepId[],
  payload: StoryExtractionReviewPayload
): boolean {
  const idx = orderedStepIds.indexOf(stepId)
  if (idx < 0) return true
  for (let i = 0; i < idx; i++) {
    if (!isPriorStepSatisfied(orderedStepIds[i], payload)) return false
  }
  return true
}

function ingestionPriorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  return priorStepsInOrder(stepId, stageStepIds('ingestion'), payload)
}

function isIngestionComplete(payload: StoryExtractionReviewPayload): boolean {
  return stageStepIds('ingestion').every((sid) => isPriorStepSatisfied(sid, payload))
}

function extractionUpstreamReady(payload: StoryExtractionReviewPayload): boolean {
  return isIngestionComplete(payload) && isStepComplete('chunk-story-bodies', payload)
}

function extractionLanePriorStepsSatisfied(
  stepId: PipelineStepId,
  laneId: 'claims',
  payload: StoryExtractionReviewPayload
): boolean {
  if (!extractionUpstreamReady(payload)) return false
  return priorStepsInOrder(stepId, [...getExtractionLaneStepIds(laneId)], payload)
}

function priorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const extractionLane = getExtractionStepLane(stepId)
  if (extractionLane === 'shared') {
    return isIngestionComplete(payload)
  }
  if (extractionLane === 'claims') {
    return extractionLanePriorStepsSatisfied(stepId, 'claims', payload)
  }
  if (INGESTION_STEPS.has(stepId) || stepId === 'relevance-gate') {
    return ingestionPriorStepsSatisfied(stepId, payload)
  }
  return priorStepsInOrder(stepId, PIPELINE_STEPS.map((s) => s.id), payload)
}

function canRunWhenBlocked(stepId: PipelineStepId): boolean {
  return canRunExtractionWhenBlocked(stepId)
}

function isStoryStepRunnable(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (isChunkParallelStep(stepId)) return false

  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (!def) return false

  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) return false

  const domainComplete = isStepCompleteDomain(stepId, payload)
  const complete = resolveChecklistStepComplete(payload, stepId, domainComplete)
  const blocked = isStepBlockedDomain(stepId, payload)
  const priorOk = priorStepsSatisfied(stepId, payload)

  if (isStoryStepRunInFlight(payload, stepId, domainComplete)) return false
  const extractionLane = getExtractionStepLane(stepId)
  const lanePipelineBlocked =
    extractionLane != null
      ? isExtractionLanePipelineBlocked(extractionLane, payload)
      : isPipelineBlocked(payload)
  const blockedGate = lanePipelineBlocked && !canRunWhenBlocked(stepId)

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

  if (stepId === 'chunk-story-bodies') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      payload.story.relevance_status === 'KEEP' &&
      payload.story.has_content_clean
    )
  }

  return (
    !complete &&
    !blocked &&
    priorOk &&
    !blockedGate &&
    !def.optional
  )
}

function isChunkScopeStepRunnable(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  chunkIndex: number
): boolean {
  if (!isChunkParallelStep(stepId)) return false

  const chunk = payload.chunks.find((c) => c.chunk_index === chunkIndex)
  if (!chunk) return false

  const domainComplete = isStepCompleteDomain(stepId, payload)
  if (isStoryStepRunInFlight(payload, stepId, domainComplete, chunkIndex)) return false

  return isChunkStepRunnable(stepId, chunk, payload)
}

function scopedStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload,
  options: PipelineChecklistScope,
  chunkIndex?: number
): string | null {
  if (options.scope === 'story' && isChunkParallelStep(stepId)) {
    return chunkParallelStepProgress(stepId, payload)
  }
  if (options.scope === 'chunk' && chunkIndex != null && isChunkParallelStep(stepId)) {
    const chunk = payload.chunks.find((c) => c.chunk_index === chunkIndex)
    if (!chunk) return null
    return chunkStepProgressLabel(stepId, chunk)
  }
  return stepProgress(stepId, payload)
}

export function derivePipelineChecklist(
  payload: StoryExtractionReviewPayload,
  options: PipelineChecklistScope = { scope: 'story' }
): PipelineChecklist {
  const blockedReason = getBlockedReason(payload)
  const pipelineBlocked = isPipelineBlocked(payload)

  const currentLaneKeys = new Set<string>()
  let foundGlobalCurrent = false

  function statusLaneKey(stepId: PipelineStepId): string {
    const lane = getExtractionStepLane(stepId)
    if (lane === 'claims') return lane
    if (lane === 'shared') return 'extraction-shared'
    return 'global'
  }

  const steps: PipelineStepState[] = PIPELINE_STEPS.map((def) => {
    const chunkRow =
      options.scope === 'chunk'
        ? payload.chunks.find((c) => c.chunk_index === options.chunkIndex)
        : undefined
    const chunkScopedComplete =
      chunkRow != null && isChunkParallelStep(def.id)
        ? isChunkStepDomainComplete(def.id, chunkRow)
        : null
    const domainComplete = isStepCompleteDomain(def.id, payload)
    const chunkScoped = options.scope === 'chunk'
    const complete = chunkScopedComplete ?? (chunkScoped
      ? domainComplete
      : resolveChecklistStepComplete(payload, def.id, domainComplete))
    const blocked = chunkScoped
      ? isStepBlockedDomain(def.id, payload)
      : resolveChecklistStepBlocked(payload, def.id, isStepBlockedDomain(def.id, payload))
    const optional = isStepOptional(def.id, payload)
    const logStatus =
      chunkScoped || (options.scope === 'story' && isChunkParallelStep(def.id))
        ? null
        : resolveChecklistStepStatus(payload, def.id, domainComplete)
    const logProgress =
      chunkScoped || (options.scope === 'story' && isChunkParallelStep(def.id))
        ? null
        : resolveChecklistStepProgress(payload, def.id, domainComplete)
    const chunkIndex = options.scope === 'chunk' ? options.chunkIndex : undefined
    const progress =
      logProgress ?? scopedStepProgress(def.id, payload, options, chunkIndex)

    let status: PipelineStepStatus
    if (logStatus) {
      status = logStatus
    } else if (blocked && !complete) {
      status = 'blocked'
    } else if (complete) {
      status = 'complete'
    } else if (optional && def.optional) {
      status = 'optional'
    } else if (optional) {
      status = 'optional'
    } else {
      const laneKey = statusLaneKey(def.id)
      if (laneKey === 'global') {
        if (!foundGlobalCurrent) {
          status = 'current'
          foundGlobalCurrent = true
        } else {
          status = 'pending'
        }
      } else if (!currentLaneKeys.has(laneKey)) {
        status = 'current'
        currentLaneKeys.add(laneKey)
      } else {
        status = 'pending'
      }
    }

    return {
      id: def.id,
      deployName: def.deployName,
      label: def.label,
      stageId: def.stageId,
      stageLabel: def.stageLabel,
      status,
      progress,
      runnable:
        options.scope === 'chunk'
          ? isChunkScopeStepRunnable(def.id, payload, options.chunkIndex)
          : isStoryStepRunnable(def.id, payload),
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
  return { stepId }
}

export function getStepOutputSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  return snapshotForStep(stepId, payload)
}

export type StageSummaryStatus = 'complete' | 'current' | 'blocked' | 'pending'

export {
  CHUNK_LANE_PHASE_LABELS,
  chunkLanePhaseLabel,
  chunkNeedsAction,
  deriveChunkLanePhase,
  type ChunkLanePhase,
} from '@/lib/admin/pipeline-status/chunk-phase'

export {
  chunkHasRefineArtifact,
  getChunkLaneQaRevertTip,
  getChunkRefineRecoveryMessage,
} from '@/lib/admin/pipeline-status/chunk-revert-tip'

export {
  getChunkStepRevertBlockedReason,
  getRevertBlockedReason,
  getRevertStepDescription,
  getRevertibleStepId,
  isChunkStepRevertible,
  isReviewPendingActuallyRan,
  isStepRevertible,
  REVERT_SCOPE_STEP_IDS,
} from '@/lib/admin/pipeline-status/revert'
