import {
  PIPELINE_STAGES,
  PIPELINE_STEPS,
  type PipelineStageId,
  type PipelineStepId,
} from '@/lib/admin/generated/pipeline-catalog'
import { storyAdminHref } from '@/lib/admin/friendly-id'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  resolvePipelineStepProgressFromRunLog,
  resolvePipelineStepStatusFromRunLog,
} from '@/lib/admin/pipeline-step-run-display'
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
  isExtractionLanePipelineBlocked,
  isExtractionPipelineBlocked,
  isExtractionStageComplete,
  isExtractionStepBlocked,
  isExtractionStepComplete,
  isChunkClaimsReviewComplete,
  isChunkClaimsReviewStarted,
  isChunkPositionsReviewApproved,
  isChunkPositionsReviewStarted,
  isChunkReviewApproved,
  isMergeValidated,
  isPositionsLaneStarted,
  isRefineOptional,
} from '@/lib/admin/pipeline-status/extraction'

export {
  CLAIMS_LANE_STEP_IDS,
  EXTRACTION_PARALLEL_LANES,
  EXTRACTION_SHARED_STEP_IDS,
  EXTRACTION_STEP_GROUPS,
  EXTRACTION_TIMELINE_HIDDEN_STEPS,
  getExtractionLaneStepIds,
  getExtractionStepLane,
  MERGE_QA_STEP_IDS,
  POSITIONS_LANE_STEP_IDS,
} from '@/lib/admin/pipeline-status/extraction-groups'
import {
  CLAIMS_LANE_STEP_IDS,
  getExtractionLaneStepIds,
  getExtractionStepLane,
  MERGE_QA_STEP_IDS,
  POSITIONS_LANE_STEP_IDS,
} from '@/lib/admin/pipeline-status/extraction-groups'
import { linkEntitiesPrerequisiteStepIds } from '@/lib/admin/pipeline-flow-layout'
import {
  isChunkAwaitingFirstReview,
  isChunkPendingRereviewAfterRefine,
  laneHasChunksNeedingRefinement,
  laneHasChunksPendingRereview,
  laneHasChunksReadyToRefine,
  refineLanePriorOk,
} from '@/lib/admin/pipeline-status/qa-lane-state'
import { isStepRevertible } from '@/lib/admin/pipeline-status/revert'
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

const INGESTION_STEPS = new Set([
  'relevance-gate',
  'scrape-story-content',
  'clean-scraped-content',
  'review-pending-stories',
])

const EXTRACTION_STEPS = new Set([
  'chunk-story-bodies',
  'extract-story-claims',
  'extract-story-positions',
  'validate-chunk-claims',
  'validate-chunk-positions',
  'refine-chunk-claims',
  'refine-chunk-positions',
  'merge-story-claims',
  'merge-story-positions',
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
  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) return true
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
  if (CANONICAL_STEPS.has(stepId)) return canonicalStepProgress(stepId, payload)
  return null
}

function isStepOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'review-pending-stories') return isReviewPendingOptional(payload)
  if (
    stepId === 'refine-chunk-claims' ||
    stepId === 'refine-chunk-positions' ||
    stepId === 'refine-merged-extraction'
  ) {
    return isRefineOptional(stepId, payload)
  }
  if (stepId === 'merge-story-positions' && !isPositionsLaneStarted(payload)) return true
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (def?.optional && isMergeValidated(payload)) return true
  return false
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
  laneId: 'claims' | 'positions' | 'merge-qa',
  payload: StoryExtractionReviewPayload
): boolean {
  if (!extractionUpstreamReady(payload)) return false

  if (laneId === 'merge-qa') {
    if (!isPriorStepSatisfied('merge-story-claims', payload)) return false
    if (isPositionsLaneStarted(payload) && !isPriorStepSatisfied('merge-story-positions', payload)) {
      return false
    }
    return priorStepsInOrder(stepId, [...MERGE_QA_STEP_IDS], payload)
  }

  return priorStepsInOrder(stepId, [...getExtractionLaneStepIds(laneId)], payload)
}

function allRequiredExtractionComplete(payload: StoryExtractionReviewPayload): boolean {
  const requiredSteps: PipelineStepId[] = [
    'chunk-story-bodies',
    ...CLAIMS_LANE_STEP_IDS,
    ...MERGE_QA_STEP_IDS,
  ]
  if (isPositionsLaneStarted(payload)) {
    requiredSteps.push(...POSITIONS_LANE_STEP_IDS)
  }
  return requiredSteps.every((sid) => isPriorStepSatisfied(sid, payload))
}

function canonicalPriorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (!allRequiredExtractionComplete(payload)) return false
  return priorStepsInOrder(stepId, stageStepIds('canonical'), payload)
}

function linkEntitiesPrerequisitesMet(payload: StoryExtractionReviewPayload): boolean {
  return linkEntitiesPrerequisiteStepIds().every((sid) => isPriorStepSatisfied(sid, payload))
}

function priorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const extractionLane = getExtractionStepLane(stepId)
  if (extractionLane === 'shared') {
    return isIngestionComplete(payload)
  }
  if (extractionLane === 'claims') {
    return extractionLanePriorStepsSatisfied(stepId, 'claims', payload)
  }
  if (extractionLane === 'positions') {
    return extractionLanePriorStepsSatisfied(stepId, 'positions', payload)
  }
  if (extractionLane === 'merge-qa') {
    return extractionLanePriorStepsSatisfied(stepId, 'merge-qa', payload)
  }
  if (INGESTION_STEPS.has(stepId) || stepId === 'relevance-gate') {
    return ingestionPriorStepsSatisfied(stepId, payload)
  }
  if (CANONICAL_STEPS.has(stepId)) {
    return canonicalPriorStepsSatisfied(stepId, payload)
  }
  return priorStepsInOrder(stepId, PIPELINE_STEPS.map((s) => s.id), payload)
}

function canRunWhenBlocked(stepId: PipelineStepId): boolean {
  return canRunExtractionWhenBlocked(stepId)
}

function isRunnable(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (!def) return false

  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) return false

  const complete = isStepComplete(stepId, payload)
  const blocked = isStepBlocked(stepId, payload)
  const priorOk = priorStepsSatisfied(stepId, payload)
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

  if (stepId === 'merge-story-claims') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      isChunkReviewApproved(payload)
    )
  }

  if (stepId === 'merge-story-positions') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      isChunkPositionsReviewApproved(payload)
    )
  }

  if (stepId === 'refine-chunk-claims' || stepId === 'refine-chunk-positions') {
    const lane = stepId === 'refine-chunk-claims' ? 'claims' : 'positions'
    if (laneHasChunksReadyToRefine(lane, payload)) {
      return refineLanePriorOk(lane, payload) && !blockedGate && !blocked
    }
    if (laneHasChunksNeedingRefinement(lane, payload)) {
      return false
    }
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      !isRefineOptional(stepId, payload)
    )
  }

  if (stepId === 'validate-chunk-claims' || stepId === 'validate-chunk-positions') {
    const lane = stepId === 'validate-chunk-claims' ? 'claims' : 'positions'
    const awaitingReview =
      laneHasChunksPendingRereview(lane, payload) ||
      payload.chunks.some((chunk) => {
        if (lane === 'positions') {
          return (
            chunk.positions_extraction_json != null &&
            (chunk.positions_qa_status == null ||
              chunk.positions_qa_status === 'pending' ||
              chunk.positions_qa_status === 'needs_human_review')
          )
        }
        return (
          chunk.extraction_json != null &&
          (chunk.extraction_qa_status == null ||
            chunk.extraction_qa_status === 'pending' ||
            chunk.extraction_qa_status === 'needs_human_review')
        )
      })
    const canRun =
      (!complete || awaitingReview) &&
      priorOk &&
      !blockedGate &&
      (awaitingReview || !blocked)
    if (!canRun) return false
    if (laneHasChunksNeedingRefinement(lane, payload)) {
      return payload.chunks.some((chunk) => isChunkAwaitingFirstReview(lane, chunk))
    }
    if (isStepRevertible(stepId, payload)) {
      return payload.chunks.some(
        (chunk) =>
          isChunkAwaitingFirstReview(lane, chunk) ||
          isChunkPendingRereviewAfterRefine(lane, chunk)
      )
    }
    return true
  }

  if (stepId === 'validate-merged-extraction') {
    return (
      !complete &&
      !blocked &&
      priorOk &&
      !blockedGate &&
      linkEntitiesPrerequisitesMet(payload)
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

  const currentLaneKeys = new Set<string>()
  let foundGlobalCurrent = false

  function statusLaneKey(stepId: PipelineStepId): string {
    const lane = getExtractionStepLane(stepId)
    if (lane === 'claims' || lane === 'positions' || lane === 'merge-qa') return lane
    if (lane === 'shared') return 'extraction-shared'
    return 'global'
  }

  const steps: PipelineStepState[] = PIPELINE_STEPS.map((def) => {
    const complete = isStepComplete(def.id, payload)
    const blocked = isStepBlocked(def.id, payload)
    const optional = isStepOptional(def.id, payload)
    const logStatus = resolvePipelineStepStatusFromRunLog(payload, def.id)
    const logProgress = resolvePipelineStepProgressFromRunLog(payload, def.id)
    const progress = logProgress ?? stepProgress(def.id, payload)

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

const STAGE_HUB_ANCHOR: Record<PipelineStageId, string> = {
  ingestion: 'step-relevance-gate',
  extraction: 'step-chunk-story-bodies',
  canonical: 'lifecycle-flowchart',
}

export {
  getRevertBlockedReason,
  getRevertStepDescription,
  getRevertibleStepId,
  isReviewPendingActuallyRan,
  isStepRevertible,
  REVERT_SCOPE_STEP_IDS,
} from '@/lib/admin/pipeline-status/revert'

export function deriveStageSummaries(
  payload: StoryExtractionReviewPayload
): StageSummary[] {
  const hubBase = storyAdminHref(payload.story)
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
      href: `${hubBase}#${STAGE_HUB_ANCHOR[stage.id]}`,
    }
  })
}
