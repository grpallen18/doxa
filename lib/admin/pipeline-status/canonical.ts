import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isMergeValidated } from '@/lib/admin/pipeline-status/extraction'

export function isCanonicalStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (!isMergeValidated(payload)) return false

  switch (stepId) {
    case 'link-canonical-claims':
      return payload.claims.length === 0 || payload.claims.every((c) => c.claim_id != null)
    case 'link-canonical-events':
      return payload.events.length === 0 || payload.events.every((e) => e.event_id != null)
    case 'link-canonical-positions':
      return (
        payload.positions.length === 0 ||
        payload.positions.every((p) => p.canonical_position_id != null)
      )
    case 'update-stances':
      return payload.claims.length === 0 || payload.claims.every((c) => c.stance != null)
    default:
      return false
  }
}

export function isCanonicalStepBlocked(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (payload.story.extraction_qa_status === 'needs_human_review') {
    return [
      'link-canonical-claims',
      'link-canonical-events',
      'link-canonical-positions',
      'update-stances',
    ].includes(stepId)
  }
  return false
}

export function canonicalStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (!isMergeValidated(payload)) return null

  switch (stepId) {
    case 'link-canonical-claims': {
      const linked = payload.claims.filter((x) => x.claim_id != null).length
      return payload.claims.length > 0 ? `${linked}/${payload.claims.length} claims linked` : null
    }
    case 'link-canonical-events': {
      const linked = payload.events.filter((x) => x.event_id != null).length
      return payload.events.length > 0 ? `${linked}/${payload.events.length} events linked` : null
    }
    case 'link-canonical-positions': {
      const linked = payload.positions.filter((x) => x.canonical_position_id != null).length
      return payload.positions.length > 0
        ? `${linked}/${payload.positions.length} positions linked`
        : null
    }
    case 'update-stances': {
      const done = payload.claims.filter((x) => x.stance != null).length
      return payload.claims.length > 0 ? `${done}/${payload.claims.length} stances set` : null
    }
    default:
      return null
  }
}

export function getCanonicalNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (!isCanonicalStepComplete(stepId, payload)) return null

  switch (stepId) {
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

export function canonicalSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  return {
    stepId,
    claims: payload.claims.map((x) => ({
      id: x.story_claim_id,
      claim_id: x.claim_id,
      stance: x.stance,
    })),
    events: payload.events.map((x) => ({ id: x.story_event_id, event_id: x.event_id })),
    positions: payload.positions.map((x) => ({
      id: x.story_position_id,
      canonical_position_id: x.canonical_position_id,
    })),
  }
}
