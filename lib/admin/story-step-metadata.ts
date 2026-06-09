import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { getStepOutputSnapshot, isStepComplete } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

const STEP_QA_STAGES: Partial<Record<PipelineStepId, readonly string[]>> = {
  'extract-story-claims': ['chunk_extract_claims', 'chunk_extract'],
  'validate-chunk-claims': ['chunk_review_claims', 'chunk_review', 'chunk_validate'],
  'refine-chunk-claims': ['chunk_refine_claims', 'chunk_refine'],
  'extract-story-positions': ['chunk_extract_positions'],
  'validate-chunk-positions': ['chunk_review_positions'],
  'refine-chunk-positions': ['chunk_refine_positions'],
  'review-merged-extraction': ['merge_review'],
  'refine-merged-extraction': ['merge_refine'],
  'validate-merged-extraction': ['merge_validate'],
}

function maxIso(dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => Boolean(d))
  if (valid.length === 0) return null
  return valid.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest
  )
}

function latestQaArtifactAt(
  payload: StoryExtractionReviewPayload,
  stages: readonly string[]
): string | null {
  let latest: string | null = null
  for (const artifact of payload.qa_artifacts) {
    if (!stages.includes(artifact.stage)) continue
    if (!latest || new Date(artifact.created_at).getTime() > new Date(latest).getTime()) {
      latest = artifact.created_at
    }
  }
  return latest
}

export function getStoryStepQaArtifactStages(stepId: PipelineStepId): readonly string[] {
  return STEP_QA_STAGES[stepId] ?? []
}

export function getStoryStepCompletedAt(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (!isStepComplete(stepId, payload)) return null

  const { story, chunks } = payload
  const qaStages = STEP_QA_STAGES[stepId]

  switch (stepId) {
    case 'relevance-gate':
      return story.relevance_ran_at
    case 'review-pending-stories':
      return story.pending_review_ran_at
    case 'scrape-story-content':
      return story.scraped_at
    case 'clean-scraped-content':
      return story.cleaned_at
    case 'chunk-story-bodies':
      return story.cleaned_at
    case 'extract-story-claims':
      return maxIso([
        latestQaArtifactAt(payload, qaStages ?? []),
        story.extraction_completed_at,
      ])
    case 'extract-story-positions':
      return latestQaArtifactAt(payload, qaStages ?? [])
    case 'validate-chunk-claims':
      return maxIso([
        latestQaArtifactAt(payload, qaStages ?? []),
        ...chunks.map((c) => c.extraction_qa_validated_at),
      ])
    case 'validate-chunk-positions':
      return maxIso([
        latestQaArtifactAt(payload, qaStages ?? []),
        ...chunks.map((c) => c.positions_qa_validated_at),
      ])
    case 'refine-chunk-claims':
    case 'refine-chunk-positions':
      return latestQaArtifactAt(payload, qaStages ?? [])
    case 'merge-story-claims':
    case 'merge-story-positions':
      return story.merged_at
    case 'review-merged-extraction':
    case 'refine-merged-extraction':
      return latestQaArtifactAt(payload, qaStages ?? [])
    case 'validate-merged-extraction':
      return maxIso([story.extraction_qa_validated_at, latestQaArtifactAt(payload, qaStages ?? [])])
    case 'link-canonical-claims':
    case 'link-canonical-events':
    case 'link-canonical-positions':
    case 'update-stances':
      return story.extraction_qa_validated_at
    default:
      return qaStages ? latestQaArtifactAt(payload, qaStages) : null
  }
}

export function getStoryStepQaArtifacts(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
) {
  const stages = STEP_QA_STAGES[stepId]
  if (!stages?.length) return []
  return payload.qa_artifacts.filter((artifact) => stages.includes(artifact.stage))
}

export function getStoryStepMetadataSnapshot(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
) {
  return {
    step_id: stepId,
    complete: isStepComplete(stepId, payload),
    completed_at: getStoryStepCompletedAt(stepId, payload),
    output_snapshot: getStepOutputSnapshot(stepId, payload),
    qa_artifacts: getStoryStepQaArtifacts(stepId, payload),
  }
}
