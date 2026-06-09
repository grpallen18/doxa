import { flattenExtractionJson } from '@/lib/admin/chunk-extraction'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import { derivePipelineChecklist } from '@/lib/admin/pipeline-status'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  appendChunkQaMarkdown,
  bullet,
  formatChunkQa,
  formatExportDate,
} from '@/lib/admin/record-export/shared'

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
      content_length_clean: story.content_length_clean,
    },
    article_text: story.article_text,
    pipeline_steps: derivePipelineChecklist(payload).steps
      .filter((s) =>
        ['relevance-gate', 'review-pending-stories', 'scrape-story-content', 'clean-scraped-content'].includes(
          s.id
        )
      )
      .map((s) => ({ id: s.id, label: s.label, status: s.status, progress: s.progress })),
  }
}

function extractionPayload(payload: StoryExtractionReviewPayload) {
  const { story, chunks } = payload
  const merged = story.merged_at != null

  return {
    export_scope: 'story_stage_extraction' as const,
    story: {
      story_id: story.story_id,
      story_friendly_id: story.friendly_id,
      title: story.title,
      extraction_status: story.extraction_status,
      extraction_completed_at: story.extraction_completed_at,
      merged_at: story.merged_at,
      extraction_qa_status: story.extraction_qa_status,
    },
    chunks: chunks.map((chunk) => ({
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      content: chunk.content,
      extraction_json: chunk.extraction_json,
      extraction: chunk.extraction_json
        ? flattenExtractionJson(chunk.chunk_index, chunk.extraction_json)
        : null,
      qa: formatChunkQa(chunk),
    })),
    story_merge_qa: merged
      ? {
          review_report: story.extraction_qa_review_report,
          validation_report: story.extraction_qa_validation_report,
        }
      : null,
    merged_entities: merged
      ? {
          claims: payload.claims,
          evidence: payload.evidence,
          positions: payload.positions,
          events: payload.events,
          links: payload.links,
        }
      : null,
    pipeline_steps: derivePipelineChecklist(payload).steps
      .filter((s) =>
        [
          'chunk-story-bodies',
          'extract-story-claims',
          'validate-chunk-claims',
          'refine-chunk-claims',
          'merge-story-claims',
          'review-merged-extraction',
          'refine-merged-extraction',
          'validate-merged-extraction',
        ].includes(s.id)
      )
      .map((s) => ({ id: s.id, label: s.label, status: s.status, progress: s.progress })),
  }
}

function canonicalPayload(payload: StoryExtractionReviewPayload) {
  const { story, claims, positions, events } = payload
  return {
    export_scope: 'story_stage_canonical' as const,
    story: {
      story_id: story.story_id,
      story_friendly_id: story.friendly_id,
      title: story.title,
      merged_at: story.merged_at,
      extraction_qa_status: story.extraction_qa_status,
    },
    claims: claims.map((c) => ({
      story_claim_id: c.story_claim_id,
      raw_text: c.raw_text,
      claim_id: c.claim_id,
    })),
    positions: positions.map((p) => ({
      story_position_id: p.story_position_id,
      raw_text: p.raw_text,
      canonical_position_id: p.canonical_position_id,
    })),
    events: events.map((e) => ({
      story_event_id: e.story_event_id,
      event_summary: e.event_summary,
      event_id: e.event_id,
    })),
    pipeline_steps: derivePipelineChecklist(payload).steps
      .filter((s) =>
        [
          'link-canonical-claims',
          'link-canonical-events',
          'link-canonical-positions',
          'update-stances',
        ].includes(s.id)
      )
      .map((s) => ({ id: s.id, label: s.label, status: s.status, progress: s.progress })),
  }
}

export function buildStoryStageExportPayload(
  stageId: PipelineStageId,
  payload: StoryExtractionReviewPayload
) {
  switch (stageId) {
    case 'ingestion':
      return ingestionPayload(payload)
    case 'extraction':
      return extractionPayload(payload)
    case 'canonical':
      return canonicalPayload(payload)
    default:
      return ingestionPayload(payload)
  }
}

export function buildStoryStageExportJson(
  stageId: PipelineStageId,
  payload: StoryExtractionReviewPayload
): string {
  return JSON.stringify(buildStoryStageExportPayload(stageId, payload), null, 2)
}

export function buildStoryStageExportMarkdown(
  stageId: PipelineStageId,
  payload: StoryExtractionReviewPayload
): string {
  const data = buildStoryStageExportPayload(stageId, payload)
  const lines: string[] = [`# Story stage export (${stageId})`, '']
  lines.push(bullet('Export scope', data.export_scope))
  lines.push('```json')
  lines.push(JSON.stringify(data, null, 2))
  lines.push('```')

  if (stageId === 'extraction' && 'chunks' in data) {
    lines.push('')
    for (const chunk of data.chunks) {
      lines.push(`## Chunk ${chunk.chunk_friendly_id}`, '')
      lines.push('### Chunk text', '')
      lines.push(chunk.content ?? '(no content)')
      lines.push('')
      appendChunkQaMarkdown(lines, chunk.qa)
    }
  }

  return lines.join('\n')
}
