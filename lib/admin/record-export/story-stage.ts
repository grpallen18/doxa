import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { bullet, formatExportDate } from '@/lib/admin/record-export/shared'

function ingestionPayload(payload: StoryExtractionReviewPayload) {
  const { story } = payload
  return {
    export_scope: 'story_stage_ingestion' as const,
    story: {
      story_id: story.story_id,
      story_friendly_id: story.friendly_id,
      title: story.title,
      url: story.url,
      relevance_status: story.relevance_status,
      relevance_score: story.relevance_score,
      relevance_ran_at: story.relevance_ran_at,
      relevance_tags: story.relevance_tags,
      pending_review_ran_at: story.pending_review_ran_at,
      scraped_at: story.scraped_at,
      scrape_dispatched_at: story.scrape_dispatched_at,
      scrape_skipped: story.scrape_skipped,
      scrape_fail_count: story.scrape_fail_count,
      has_content_clean: story.has_content_clean,
      cleaned_at: story.cleaned_at,
    },
  }
}

export function buildStoryStageExport(
  payload: StoryExtractionReviewPayload,
  stageId: PipelineStageId
) {
  if (stageId === 'ingestion') return ingestionPayload(payload)
  const checklist = derivePipelineChecklist(payload)
  return {
    export_scope: `story_stage_${stageId}` as const,
    stage_id: stageId,
    steps: checklist.steps.filter((s) => s.stageId === stageId),
  }
}

export function buildStoryStageMarkdown(
  payload: StoryExtractionReviewPayload,
  stageId: PipelineStageId
): string {
  if (stageId === 'ingestion') {
    const s = payload.story
    return [
      '# Story Stage — Ingestion',
      '',
      bullet('Title', s.title),
      bullet('Relevance', s.relevance_status),
      bullet('Scraped at', formatExportDate(s.scraped_at)),
      bullet('Cleaned at', formatExportDate(s.cleaned_at)),
      '',
    ].join('\n')
  }
  const checklist = derivePipelineChecklist(payload)
  const lines = [`# Story Stage — ${stageId}`, '']
  for (const step of checklist.steps.filter((s) => s.stageId === stageId)) {
    lines.push(bullet(step.label, step.status))
  }
  lines.push('')
  return lines.join('\n')
}
