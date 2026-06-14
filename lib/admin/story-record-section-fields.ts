import type { RecordField } from '@/components/admin/record/record-field-grid'
import { formatAdminDateTimeOrNull } from '@/lib/admin/format-datetime'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import { POST_MERGE_STEP_IDS } from '@/lib/admin/story-lifecycle'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

function reportPresent(value: unknown): string {
  return value != null ? 'Yes' : 'No'
}

function relationshipCount(payload: StoryExtractionReviewPayload): number {
  const { links } = payload
  return (
    links.claimEvidence.length +
    links.claimPosition.length +
    links.positionEvidence.length +
    links.eventClaim.length +
    links.eventEvidence.length +
    links.positionEventContext.length
  )
}

export function chunkSectionFields(payload: StoryExtractionReviewPayload): RecordField[] {
  const { chunks } = payload
  const totalChars = chunks.reduce((sum, chunk) => sum + (chunk.content?.length ?? 0), 0)
  const withExtraction = chunks.filter((chunk) => chunk.extraction_json != null).length
  const averageLength =
    chunks.length > 0 ? Math.round(totalChars / chunks.length) : null

  return [
    { label: 'Number of chunks', value: chunks.length },
    {
      label: 'Total characters',
      value: totalChars > 0 ? totalChars.toLocaleString() : null,
    },
    { label: 'Chunks with extraction', value: withExtraction },
    {
      label: 'Average chunk length',
      value:
        averageLength != null ? `${averageLength.toLocaleString()} characters` : null,
    },
  ]
}

export function extractedAtomsSectionFields(
  payload: StoryExtractionReviewPayload
): RecordField[] {
  const { claims, positions, events, evidence } = payload

  return [
    { label: 'Claims', value: claims.length },
    { label: 'Positions', value: positions.length },
    { label: 'Events', value: events.length },
    { label: 'Evidence', value: evidence.length },
    { label: 'Relationships', value: relationshipCount(payload) },
  ]
}

export function validationReviewSectionFields(
  payload: StoryExtractionReviewPayload
): RecordField[] {
  const { story } = payload

  return [
    {
      label: 'QA status',
      value: story.extraction_qa_status
        ? qaStatusLabel(story.extraction_qa_status)
        : null,
    },
    {
      label: 'Refinement cycles',
      value: story.extraction_qa_refinement_count,
    },
    {
      label: 'Validated at',
      value: formatAdminDateTimeOrNull(story.extraction_qa_validated_at),
    },
    {
      label: 'Review report',
      value: reportPresent(story.extraction_qa_review_report),
    },
    {
      label: 'Validation report',
      value: reportPresent(story.extraction_qa_validation_report),
    },
  ]
}

export function mergeResultsSectionFields(
  payload: StoryExtractionReviewPayload
): RecordField[] {
  const { story, claims, positions, events } = payload
  const canonicalClaims = claims.filter((claim) => claim.claim_id != null).length
  const canonicalPositions = positions.filter(
    (position) => position.canonical_position_id != null
  ).length
  const canonicalEvents = events.filter((event) => event.event_id != null).length

  return [
    { label: 'Merged claims', value: claims.length },
    { label: 'Canonical claims', value: canonicalClaims },
    { label: 'Story positions', value: positions.length },
    { label: 'Canonical positions', value: canonicalPositions },
    { label: 'Story events', value: events.length },
    { label: 'Canonical events', value: canonicalEvents },
    { label: 'Merged at', value: formatAdminDateTimeOrNull(story.merged_at) },
  ]
}

export function postMergeSectionFields(
  payload: StoryExtractionReviewPayload
): RecordField[] {
  const checklist = derivePipelineChecklist(payload)
  const postMergeSteps = checklist.steps.filter((step) =>
    POST_MERGE_STEP_IDS.includes(step.id)
  )
  const completeCount = postMergeSteps.filter((step) => step.status === 'complete').length

  return [
    {
      label: 'Canonical steps complete',
      value: `${completeCount} of ${postMergeSteps.length}`,
    },
    { label: 'Extraction status', value: payload.story.extraction_status },
    { label: 'Merged at', value: formatAdminDateTimeOrNull(payload.story.merged_at) },
    {
      label: 'Extraction completed',
      value: formatAdminDateTimeOrNull(payload.story.extraction_completed_at),
    },
  ]
}
