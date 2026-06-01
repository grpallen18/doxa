import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

/** Matches doxa-agents chunk-story-bodies defaults. */
export const STORY_CHUNK_SIZE = 3500
export const STORY_CHUNK_OVERLAP = 500

export type ArticleSpan = { start: number; end: number }

export type EntitySpanSource = {
  chunkIndex: number
  spanStart: number | null
  spanEnd: number | null
  sourceExcerpt?: string | null
}

export function computeChunkStartOffsets(
  articleLength: number,
  chunkSize = STORY_CHUNK_SIZE,
  overlap = STORY_CHUNK_OVERLAP
): number[] {
  if (articleLength <= 0) return []
  if (articleLength <= chunkSize) return [0]

  const offsets: number[] = []
  let start = 0
  while (start < articleLength) {
    offsets.push(start)
    const end = Math.min(start + chunkSize, articleLength)
    if (end >= articleLength) break
    start = end - overlap
  }
  return offsets
}

export function resolveArticleSpan(
  articleText: string,
  chunks: StoryExtractionReviewPayload['chunks'],
  entity: EntitySpanSource
): ArticleSpan | null {
  if (!articleText) return null

  const { chunkIndex, spanStart, spanEnd, sourceExcerpt } = entity

  if (
    spanStart != null &&
    spanEnd != null &&
    spanStart >= 0 &&
    spanEnd > spanStart
  ) {
    const chunk = chunks.find((c) => c.chunk_index === chunkIndex)
    if (chunk?.content) {
      const chunkOffset = articleText.indexOf(chunk.content)
      if (chunkOffset >= 0) {
        const start = chunkOffset + spanStart
        const end = chunkOffset + spanEnd
        if (end <= articleText.length) return { start, end }
      }
    }

    const offsets = computeChunkStartOffsets(articleText.length)
    const base = offsets[chunkIndex]
    if (base != null) {
      const start = base + spanStart
      const end = base + spanEnd
      if (end <= articleText.length && start >= 0) return { start, end }
    }
  }

  const excerpt = sourceExcerpt?.trim()
  if (excerpt) {
    const idx = articleText.indexOf(excerpt)
    if (idx >= 0) return { start: idx, end: idx + excerpt.length }
  }

  return null
}

export function isValidArticleSpan(span: ArticleSpan | null, textLength: number): span is ArticleSpan {
  if (!span) return false
  return span.start >= 0 && span.end > span.start && span.end <= textLength
}
