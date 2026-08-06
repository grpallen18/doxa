import {
  extractedAtomsSectionFields,
} from '@/lib/admin/story-record-section-fields'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { bullet, formatExportDate } from '@/lib/admin/record-export/shared'

function storyMeta(story: StoryExtractionReviewPayload['story']) {
  return {
    story_id: story.story_id,
    story_friendly_id: story.friendly_id,
    title: story.title,
    url: story.url,
    author: story.author,
    source_name: story.source_name,
    published_at: story.published_at,
    fetched_at: story.fetched_at,
    relevance_status: story.relevance_status,
    relevance_score: story.relevance_score,
    scraped_at: story.scraped_at,
    has_content_clean: story.has_content_clean,
    cleaned_at: story.cleaned_at,
  }
}

export function buildStoryRecordExport(payload: StoryExtractionReviewPayload) {
  return {
    export_scope: 'story_record' as const,
    story: storyMeta(payload.story),
    atoms: extractedAtomsSectionFields(payload),
    claims: payload.claims,
    evidence: payload.evidence,
    positions: payload.positions,
    events: payload.events,
  }
}

export function buildStoryRecordMarkdown(payload: StoryExtractionReviewPayload): string {
  const { story } = payload
  const lines: string[] = [
    '# Story Record',
    '',
    bullet('Title', story.title),
    bullet('Source', story.source_name),
    bullet('URL', story.url),
    bullet('Published', formatExportDate(story.published_at)),
    bullet('Fetched', formatExportDate(story.fetched_at)),
    bullet('Cleaned body', story.has_content_clean ? 'yes' : 'no'),
    '',
    '_Legacy claims atoms removed — use Admin Neo._',
    '',
  ]
  return lines.join('\n')
}
