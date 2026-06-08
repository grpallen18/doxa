import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { PipelineStepStatus } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export const STORY_DROPPED_PROGRESS = 'Story dropped — no further pipeline steps'

const QUALIFICATION_STEP_IDS = new Set<PipelineStepId>([
  'relevance-gate',
  'review-pending-stories',
])

export function isStoryDropped(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.relevance_status === 'DROP'
}

export function isQualificationPipelineStep(stepId: PipelineStepId): boolean {
  return QUALIFICATION_STEP_IDS.has(stepId)
}

export function isIngestionStepExecuted(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const { story } = payload
  switch (stepId) {
    case 'relevance-gate':
      return story.relevance_ran_at != null
    case 'review-pending-stories':
      return story.pending_review_ran_at != null
    case 'scrape-story-content':
      return (
        story.scraped_at != null ||
        story.scrape_skipped === true ||
        story.scrape_dispatched_at != null ||
        (story.scrape_fail_count ?? 0) > 0
      )
    case 'clean-scraped-content':
      return story.cleaned_at != null
    default:
      return false
  }
}

export function isIngestionStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const { story } = payload
  switch (stepId) {
    case 'relevance-gate':
      return story.relevance_status != null
    case 'review-pending-stories':
      return isQualifyResolved(payload)
    case 'scrape-story-content':
      return story.scraped_at != null || story.scrape_skipped === true
    case 'clean-scraped-content':
      return story.has_content_clean === true
    default:
      return false
  }
}

export function isIngestionStepBlocked(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  if (isStoryDropped(payload) && !isQualificationPipelineStep(stepId)) {
    return true
  }

  const status = payload.story.relevance_status
  if (stepId === 'scrape-story-content' || stepId === 'clean-scraped-content') {
    if (!isQualifyResolved(payload)) return false
    return status !== 'KEEP'
  }
  return false
}

export function isQualifyResolved(payload: StoryExtractionReviewPayload): boolean {
  const status = payload.story.relevance_status
  return status != null && status !== 'PENDING'
}

export function getQualifyTimelineStatus(
  payload: StoryExtractionReviewPayload,
  relevanceStepStatus: PipelineStepStatus
): PipelineStepStatus {
  const status = payload.story.relevance_status
  if (status == null) {
    return relevanceStepStatus === 'blocked' ? 'blocked' : relevanceStepStatus
  }
  if (status === 'PENDING') return 'current'
  return 'complete'
}

export function ingestionStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  const { story } = payload
  switch (stepId) {
    case 'relevance-gate':
      if (story.relevance_status === 'PENDING') {
        return 'Pending — resolve Keep or Drop before scrape'
      }
      return null
    case 'review-pending-stories':
      return story.relevance_status === 'PENDING' ? 'Awaiting Keep/Drop review' : null
    case 'scrape-story-content':
      if (!isQualifyResolved(payload)) return null
      if (story.relevance_status === 'DROP') return STORY_DROPPED_PROGRESS
      if (story.relevance_status !== 'KEEP') return 'Requires Keep qualification'
      if (story.scrape_skipped) return 'Scrape skipped'
      if (story.scraped_at) return 'Scraped'
      if (story.scrape_dispatched_at) return 'Scrape dispatched'
      if (story.scrape_fail_count != null && story.scrape_fail_count > 0) {
        return `${story.scrape_fail_count} failed attempt(s)`
      }
      return null
    case 'clean-scraped-content':
      if (!isQualifyResolved(payload)) return null
      if (story.relevance_status === 'DROP') return STORY_DROPPED_PROGRESS
      if (story.relevance_status !== 'KEEP') return 'Requires Keep qualification'
      return story.has_content_clean ? 'Clean body ready' : null
    default:
      return null
  }
}

export function isReviewPendingOptional(payload: StoryExtractionReviewPayload): boolean {
  return payload.story.relevance_status !== 'PENDING' && isIngestionStepComplete('relevance-gate', payload)
}

export function getIngestionNotRequiredMessage(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  if (stepId === 'review-pending-stories' && isReviewPendingOptional(payload)) {
    return 'Story is not Pending — qualification already resolved (Keep or Drop).'
  }
  return null
}

export function ingestionSnapshot(stepId: PipelineStepId, payload: StoryExtractionReviewPayload) {
  const { story } = payload
  return {
    stepId,
    relevance_status: story.relevance_status,
    relevance_ran_at: story.relevance_ran_at,
    scraped_at: story.scraped_at,
    scrape_dispatched_at: story.scrape_dispatched_at,
    scrape_skipped: story.scrape_skipped,
    scrape_fail_count: story.scrape_fail_count,
    has_content_clean: story.has_content_clean,
  }
}
