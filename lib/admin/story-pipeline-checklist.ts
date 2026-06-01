import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type PipelineStepId =
  | 'chunk-story-bodies'
  | 'extract-story-claims'
  | 'validate-chunk-claims'
  | 'merge-story-claims'
  | 'review-merged-extraction'
  | 'refine-merged-extraction'
  | 'validate-merged-extraction'
  | 'link-canonical-claims'
  | 'link-canonical-events'
  | 'link-canonical-positions'
  | 'update-stances'

export type PipelineStepStatus = 'complete' | 'current' | 'pending' | 'blocked' | 'optional'

export type PipelineStepState = {
  id: PipelineStepId
  deployName: string
  label: string
  status: PipelineStepStatus
  progress: string | null
  runnable: boolean
}

export type PipelineChecklist = {
  steps: PipelineStepState[]
  blockedReason: string | null
  isPipelineBlocked: boolean
}

export const PIPELINE_STEPS: Array<{ id: PipelineStepId; deployName: string; label: string; optional?: boolean }> = [
  { id: 'chunk-story-bodies', deployName: 'chunk_story_bodies', label: 'Chunk story bodies' },
  { id: 'extract-story-claims', deployName: 'extract_story_claims', label: 'Extract primary claims' },
  { id: 'validate-chunk-claims', deployName: 'validate_chunk_claims', label: 'Validate chunk claims' },
  { id: 'merge-story-claims', deployName: 'merge_story_claims', label: 'Merge story claims' },
  { id: 'review-merged-extraction', deployName: 'review_merged_extraction', label: 'Review merged extraction' },
  { id: 'refine-merged-extraction', deployName: 'refine_merged_extraction', label: 'Refine merged extraction' },
  { id: 'validate-merged-extraction', deployName: 'validate_merged_extraction', label: 'Validate merged extraction' },
  { id: 'link-canonical-claims', deployName: 'link_canonical_claims', label: 'Link canonical claims' },
  { id: 'link-canonical-events', deployName: 'link_canonical_events', label: 'Link canonical events', optional: true },
  { id: 'link-canonical-positions', deployName: 'link_canonical_positions', label: 'Link canonical positions', optional: true },
  { id: 'update-stances', deployName: 'update_stances', label: 'Update stances', optional: true },
]

export const PIPELINE_DEPLOY_ALLOWLIST = new Set(PIPELINE_STEPS.map((s) => s.deployName))

const BATCH_DEPLOYS = new Set([
  'extract_story_claims',
  'validate_chunk_claims',
  'update_stances',
])

export function usesMaxChunks(deployName: string): boolean {
  return BATCH_DEPLOYS.has(deployName)
}

export function resolveDeployName(step: string): string | null {
  const byId = PIPELINE_STEPS.find((s) => s.id === step)
  if (byId) return byId.deployName
  if (PIPELINE_DEPLOY_ALLOWLIST.has(step)) return step
  return null
}

function chunkQaCounts(payload: StoryExtractionReviewPayload) {
  const chunks = payload.chunks
  const total = chunks.length
  const extracted = chunks.filter((c) => c.extraction_json != null)
  const withJson = extracted.length
  const pendingValidate = extracted.filter(
    (c) => c.extraction_qa_status === 'pending' || c.extraction_qa_status == null
  ).length
  const passed = extracted.filter((c) => c.extraction_qa_status === 'passed').length
  const needsHuman = extracted.filter((c) => c.extraction_qa_status === 'needs_human_review').length
  return { total, withJson, pendingValidate, passed, needsHuman }
}

function isExtractComplete(payload: StoryExtractionReviewPayload): boolean {
  const { total, withJson } = chunkQaCounts(payload)
  return total > 0 && withJson === total
}

function isMergeValidated(payload: StoryExtractionReviewPayload): boolean {
  const qa = payload.story.extraction_qa_status
  return qa === 'passed' || qa === 'needs_human_review'
}

function isChunkQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.chunks.some((c) => c.extraction_qa_status === 'needs_human_review')
}

function isMergeQaBlocked(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.extraction_qa_status === 'needs_human_review'
}

export function isPipelineBlocked(payload: StoryExtractionReviewPayload): boolean {
  return isChunkQaBlocked(payload) || isMergeQaBlocked(payload)
}

export function getBlockedReason(payload: StoryExtractionReviewPayload): string | null {
  if (isChunkQaBlocked(payload)) return 'Chunk claims validation needs human review'
  if (isMergeQaBlocked(payload)) return 'Merged extraction QA needs human review'
  return null
}

export function isStepComplete(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const qa = payload.story.extraction_qa_status
  const counts = chunkQaCounts(payload)

  switch (stepId) {
    case 'chunk-story-bodies':
      return counts.total > 0
    case 'extract-story-claims':
      return isExtractComplete(payload)
    case 'validate-chunk-claims':
      return isExtractComplete(payload) && counts.withJson > 0 && counts.passed === counts.withJson
    case 'merge-story-claims':
      return payload.story.merged_at != null
    case 'review-merged-extraction':
      return payload.story.merged_at != null && qa != null && qa !== 'pending'
    case 'refine-merged-extraction':
      return isStepComplete('review-merged-extraction', payload) && qa !== 'needs_refinement'
    case 'validate-merged-extraction':
      return isMergeValidated(payload)
    case 'link-canonical-claims':
      if (!isMergeValidated(payload)) return false
      return payload.claims.length === 0 || payload.claims.every((c) => c.claim_id != null)
    case 'link-canonical-events':
      if (!isMergeValidated(payload)) return false
      return payload.events.length === 0 || payload.events.every((e) => e.event_id != null)
    case 'link-canonical-positions':
      if (!isMergeValidated(payload)) return false
      return payload.positions.length === 0 || payload.positions.every((p) => p.canonical_position_id != null)
    case 'update-stances':
      if (!isMergeValidated(payload)) return false
      return payload.claims.length === 0 || payload.claims.every((c) => c.stance != null)
    default:
      return false
  }
}

export function isStepBlocked(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'validate-chunk-claims' && isChunkQaBlocked(payload)) return true
  if (stepId === 'validate-merged-extraction' && isMergeQaBlocked(payload)) return true
  if (
    ['link-canonical-claims', 'link-canonical-events', 'link-canonical-positions', 'update-stances'].includes(
      stepId
    ) &&
    isMergeQaBlocked(payload)
  ) {
    return true
  }
  return false
}

function stepProgress(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): string | null {
  const c = chunkQaCounts(payload)
  switch (stepId) {
    case 'extract-story-claims':
      return c.total > 0 ? `${c.withJson}/${c.total} chunks extracted` : null
    case 'validate-chunk-claims':
      return c.withJson > 0 ? `${c.passed}/${c.withJson} chunks passed` : null
    case 'link-canonical-claims': {
      if (!isMergeValidated(payload)) return null
      const linked = payload.claims.filter((x) => x.claim_id != null).length
      return payload.claims.length > 0 ? `${linked}/${payload.claims.length} claims linked` : null
    }
    case 'link-canonical-events': {
      if (!isMergeValidated(payload)) return null
      const linked = payload.events.filter((x) => x.event_id != null).length
      return payload.events.length > 0 ? `${linked}/${payload.events.length} events linked` : null
    }
    case 'link-canonical-positions': {
      if (!isMergeValidated(payload)) return null
      const linked = payload.positions.filter((x) => x.canonical_position_id != null).length
      return payload.positions.length > 0 ? `${linked}/${payload.positions.length} positions linked` : null
    }
    case 'update-stances': {
      if (!isMergeValidated(payload)) return null
      const done = payload.claims.filter((x) => x.stance != null).length
      return payload.claims.length > 0 ? `${done}/${payload.claims.length} stances set` : null
    }
    default:
      return null
  }
}

export function isRefineOptional(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  if (stepId === 'refine-merged-extraction') {
    return (
      payload.story.extraction_qa_status !== 'needs_refinement' &&
      isStepComplete('review-merged-extraction', payload)
    )
  }
  const def = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (def?.optional) {
    return isStepComplete('validate-merged-extraction', payload)
  }
  return false
}

export function getStepNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (!isStepComplete(stepId, payload)) return null

  switch (stepId) {
    case 'refine-merged-extraction': {
      const hasRefineOutput =
        (payload.story.extraction_qa_refinement_count ?? 0) > 0 ||
        payload.qa_artifacts.some((a) => a.stage === 'merge_refine')
      if (!hasRefineOutput && isRefineOptional(stepId, payload)) {
        return 'No merge refinement necessary — stage completed.'
      }
      return null
    }
    case 'link-canonical-events':
      if (isMergeValidated(payload) && payload.events.length === 0) {
        return 'No events in claims-only pipeline — optional stage completed.'
      }
      return null
    case 'link-canonical-positions':
      if (isMergeValidated(payload) && payload.positions.length === 0) {
        return 'No positions in claims-only pipeline — optional stage completed.'
      }
      return null
    case 'update-stances':
      if (isMergeValidated(payload) && payload.claims.length === 0) {
        return 'No claims — stances stage completed.'
      }
      return null
    default:
      return null
  }
}

function priorStepsSatisfied(stepId: PipelineStepId, payload: StoryExtractionReviewPayload): boolean {
  const idx = PIPELINE_STEPS.findIndex((s) => s.id === stepId)
  for (let i = 0; i < idx; i++) {
    const sid = PIPELINE_STEPS[i].id
    if (isStepComplete(sid, payload)) continue
    if (isRefineOptional(sid, payload)) continue
    if (PIPELINE_STEPS[i].optional) continue
    return false
  }
  return true
}

function canRunWhenBlocked(stepId: PipelineStepId): boolean {
  return (
    stepId === 'validate-chunk-claims' ||
    stepId === 'validate-merged-extraction' ||
    stepId === 'review-merged-extraction' ||
    stepId === 'refine-merged-extraction'
  )
}

export function derivePipelineChecklist(payload: StoryExtractionReviewPayload): PipelineChecklist {
  const blockedReason = getBlockedReason(payload)
  const pipelineBlocked = isPipelineBlocked(payload)

  let foundCurrent = false
  const steps: PipelineStepState[] = PIPELINE_STEPS.map((def) => {
    const complete = isStepComplete(def.id, payload)
    const blocked = isStepBlocked(def.id, payload)
    const optional = isRefineOptional(def.id, payload) || Boolean(def.optional)
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

    const priorOk = priorStepsSatisfied(def.id, payload)
    const blockedGate = pipelineBlocked && !canRunWhenBlocked(def.id)
    const runnable = !complete && !blocked && priorOk && !blockedGate && !(def.optional && !isMergeValidated(payload))

    return {
      id: def.id,
      deployName: def.deployName,
      label: def.label,
      status,
      progress,
      runnable,
    }
  })

  return { steps, blockedReason, isPipelineBlocked: pipelineBlocked }
}

export function isStepDoneAfterRun(
  stepId: PipelineStepId,
  before: StoryExtractionReviewPayload,
  after: StoryExtractionReviewPayload
): boolean {
  if (isStepComplete(stepId, after)) return true
  if (isStepBlocked(stepId, after)) return true
  return JSON.stringify(snapshotForStep(stepId, before)) !== JSON.stringify(snapshotForStep(stepId, after))
}

function snapshotForStep(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  const c = chunkQaCounts(payload)
  const extracted = payload.chunks
    .filter((ch) => ch.extraction_json != null)
    .map((ch) => ({
      chunk_index: ch.chunk_index,
      qa_status: ch.extraction_qa_status,
      refinement_count: ch.extraction_qa_refinement_count ?? 0,
      has_validation: ch.extraction_qa_validation_report != null,
    }))
  return {
    stepId,
    chunks: c,
    extracted,
    merged_at: payload.story.merged_at,
    qa: payload.story.extraction_qa_status,
    refinement_count: payload.story.extraction_qa_refinement_count ?? 0,
    has_merge_review: payload.story.extraction_qa_review_report != null,
    has_merge_validation: payload.story.extraction_qa_validation_report != null,
    claims: payload.claims.map((x) => ({ id: x.story_claim_id, claim_id: x.claim_id, stance: x.stance })),
    events: payload.events.map((x) => ({ id: x.story_event_id, event_id: x.event_id })),
    positions: payload.positions.map((x) => ({
      id: x.story_position_id,
      canonical_position_id: x.canonical_position_id,
    })),
  }
}

export function getStepOutputSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  return snapshotForStep(stepId, payload)
}
