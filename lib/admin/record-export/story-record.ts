import { flattenExtractionJson } from '@/lib/admin/chunk-extraction'
import {
  chunkSectionFields,
  extractedAtomsSectionFields,
  mergeResultsSectionFields,
  postMergeSectionFields,
  validationReviewSectionFields,
} from '@/lib/admin/story-record-section-fields'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import {
  appendChunkQaMarkdown,
  bullet,
  formatChunkQa,
  formatExportDate,
} from '@/lib/admin/record-export/shared'

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
    extraction_status: story.extraction_status,
    extraction_completed_at: story.extraction_completed_at,
    merged_at: story.merged_at,
    extraction_qa_status: story.extraction_qa_status,
    extraction_qa_refinement_count: story.extraction_qa_refinement_count,
    extraction_qa_validated_at: story.extraction_qa_validated_at,
  }
}

function sectionValue(value: unknown): string | number | null | undefined {
  if (value == null || value === '') return null
  if (typeof value === 'string' || typeof value === 'number') return value
  return String(value)
}

function formatSectionFields(
  title: string,
  fields: Array<{ label: string; value: unknown }>
): string[] {
  const lines = [`## ${title}`, '']
  for (const field of fields) {
    lines.push(bullet(field.label, sectionValue(field.value)))
  }
  lines.push('')
  return lines
}

export function buildStoryRecordExportPayload(payload: StoryExtractionReviewPayload) {
  const { story, chunks, claims, evidence, positions, events, links } = payload
  const merged = story.merged_at != null

  return {
    export_scope: 'story_record' as const,
    story: storyMeta(story),
    article_text: story.article_text,
    sections: {
      chunks: chunkSectionFields(payload).map((f) => ({
        label: f.label,
        value: f.value,
      })),
      extracted_atoms: extractedAtomsSectionFields(payload).map((f) => ({
        label: f.label,
        value: f.value,
      })),
      validation_review: validationReviewSectionFields(payload).map((f) => ({
        label: f.label,
        value: f.value,
      })),
      merge_results: mergeResultsSectionFields(payload).map((f) => ({
        label: f.label,
        value: f.value,
      })),
      post_merge: postMergeSectionFields(payload).map((f) => ({
        label: f.label,
        value: f.value,
      })),
    },
    chunks: chunks.map((chunk) => ({
      chunk_index: chunk.chunk_index,
      chunk_friendly_id: chunk.friendly_id,
      content_length: chunk.content?.length ?? 0,
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
      ? { claims, evidence, positions, events, links }
      : null,
  }
}

export function buildStoryRecordExportJson(payload: StoryExtractionReviewPayload): string {
  return JSON.stringify(buildStoryRecordExportPayload(payload), null, 2)
}

export function buildStoryRecordExportMarkdown(payload: StoryExtractionReviewPayload): string {
  const exportPayload = buildStoryRecordExportPayload(payload)
  const lines: string[] = []

  lines.push('# Story Record Export', '')
  lines.push(bullet('Export scope', exportPayload.export_scope))
  lines.push(bullet('Story ID', exportPayload.story.story_friendly_id))
  lines.push(bullet('Title', exportPayload.story.title))
  lines.push(bullet('URL', exportPayload.story.url))
  lines.push(bullet('Published', formatExportDate(exportPayload.story.published_at)))
  lines.push(bullet('Merged at', formatExportDate(exportPayload.story.merged_at)))
  lines.push('')

  lines.push(...formatSectionFields('Chunks summary', exportPayload.sections.chunks))
  lines.push(...formatSectionFields('Extracted atoms', exportPayload.sections.extracted_atoms))
  lines.push(
    ...formatSectionFields('Validation & review', exportPayload.sections.validation_review)
  )
  lines.push(...formatSectionFields('Merge results', exportPayload.sections.merge_results))
  lines.push(...formatSectionFields('Post-merge', exportPayload.sections.post_merge))

  lines.push('## Article text', '')
  lines.push(exportPayload.article_text ?? '(no article text)')
  lines.push('')

  for (const chunk of exportPayload.chunks) {
    lines.push(`## Chunk ${chunk.chunk_friendly_id}`, '')
    lines.push(bullet('Index', chunk.chunk_index + 1))
    lines.push(bullet('Content length', chunk.content_length))
    lines.push('')
    lines.push('### Chunk text', '')
    lines.push(chunk.content ?? '(no content)')
    lines.push('')
    appendChunkQaMarkdown(lines, chunk.qa)
  }

  if (exportPayload.story_merge_qa) {
    lines.push('## Story merge QA', '')
    lines.push('### Merge review report', '')
    lines.push('```json')
    lines.push(JSON.stringify(exportPayload.story_merge_qa.review_report, null, 2))
    lines.push('```')
    lines.push('')
    lines.push('### Merge validation report', '')
    lines.push('```json')
    lines.push(JSON.stringify(exportPayload.story_merge_qa.validation_report, null, 2))
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}
