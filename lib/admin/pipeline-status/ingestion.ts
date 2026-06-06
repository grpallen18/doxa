import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export function isIngestionStepComplete(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  const { story } = payload
  switch (stepId) {
    case 'relevance-gate':
      return story.relevance_status != null
    case 'scrape-story-content':
      return story.scraped_at != null || story.scrape_skipped === true
    case 'clean-scraped-content':
      return story.has_content_clean === true
    case 'review-pending-stories':
      return story.relevance_status !== 'PENDING'
    default:
      return false
  }
}

export function isIngestionStepBlocked(_stepId: PipelineStepId, _payload: StoryExtractionReviewPayload): boolean {
  return false
}

export function ingestionStepProgress(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): string | null {
  const { story } = payload
  switch (stepId) {
    case 'relevance-gate':
      return story.relevance_status != null
        ? `Status: ${story.relevance_status}${story.relevance_score != null ? ` (${story.relevance_score})` : ''}`
        : null
    case 'scrape-story-content':
      if (story.scrape_skipped) return 'Scrape skipped'
      if (story.scraped_at) return 'Scraped'
      if (story.scrape_dispatched_at) return 'Scrape dispatched'
      if (story.scrape_fail_count != null && story.scrape_fail_count > 0) {
        return `${story.scrape_fail_count} failed attempt(s)`
      }
      return null
    case 'clean-scraped-content':
      return story.has_content_clean ? 'Clean body ready' : null
    case 'review-pending-stories':
      return story.relevance_status === 'PENDING' ? 'Awaiting review' : null
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
    return 'Story is not PENDING — review step not required.'
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
