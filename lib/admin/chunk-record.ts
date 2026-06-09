import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoryAdminRef } from '@/lib/admin/friendly-id'
import { resolveStoryUuid } from '@/lib/admin/resolve-story-id'
import { resolveChunkIndex } from '@/lib/admin/resolve-chunk-ref'

export type ChunkRecord = {
  story_id: string
  story_friendly_id: string | null
  story_title: string
  story_url: string
  chunk_friendly_id: string
  chunk_index: number
  chunk_count: number
  content: string
  extraction_json: unknown | null
  positions_extraction_json: unknown | null
  extraction_qa_status: string | null
  extraction_qa_standardization_report: unknown | null
  extraction_qa_review_report: unknown | null
  extraction_qa_validation_report: unknown | null
  extraction_qa_refinement_count: number
  extraction_qa_validation_attempt_count: number
  extraction_qa_validated_at: string | null
}

const CHUNK_SELECT =
  'chunk_index, friendly_id, content, extraction_json, positions_extraction_json, extraction_qa_status, extraction_qa_standardization_report, extraction_qa_review_report, extraction_qa_validation_report, extraction_qa_refinement_count, extraction_qa_validation_attempt_count, extraction_qa_validated_at'

export async function fetchChunkRecord(
  supabase: SupabaseClient,
  storyIdOrFriendlyId: string,
  chunkRef: string
): Promise<ChunkRecord | null> {
  const storyId = await resolveStoryUuid(supabase, storyIdOrFriendlyId)
  if (!storyId) return null

  const chunkIndex = await resolveChunkIndex(supabase, storyId, chunkRef)
  if (chunkIndex == null) return null

  const [{ data: story }, { data: chunks, error: chunksErr }] = await Promise.all([
    supabase
      .from('stories')
      .select('story_id, friendly_id, title, url')
      .eq('story_id', storyId)
      .maybeSingle(),
    supabase
      .from('story_chunks')
      .select(CHUNK_SELECT)
      .eq('story_id', storyId)
      .order('chunk_index', { ascending: true }),
  ])

  if (!story || chunksErr) return null

  const chunk = (chunks ?? []).find((c) => c.chunk_index === chunkIndex)
  if (!chunk) return null

  return {
    story_id: story.story_id as string,
    story_friendly_id: (story.friendly_id as string | null) ?? null,
    story_title: story.title as string,
    story_url: story.url as string,
    chunk_friendly_id: chunk.friendly_id as string,
    chunk_index: chunk.chunk_index as number,
    chunk_count: (chunks ?? []).length,
    content: chunk.content as string,
    extraction_json: chunk.extraction_json,
    positions_extraction_json: chunk.positions_extraction_json,
    extraction_qa_status: (chunk.extraction_qa_status as string | null) ?? null,
    extraction_qa_standardization_report: chunk.extraction_qa_standardization_report,
    extraction_qa_review_report: chunk.extraction_qa_review_report,
    extraction_qa_validation_report: chunk.extraction_qa_validation_report,
    extraction_qa_refinement_count: (chunk.extraction_qa_refinement_count as number) ?? 0,
    extraction_qa_validation_attempt_count:
      (chunk.extraction_qa_validation_attempt_count as number) ?? 0,
    extraction_qa_validated_at: (chunk.extraction_qa_validated_at as string | null) ?? null,
  }
}

export type ChunkAdminRef = {
  friendly_id: string
}

export function chunkAdminHref(story: StoryAdminRef, chunk: ChunkAdminRef | number): string {
  const storySlug = story.friendly_id?.trim() || story.story_id
  const chunkSlug = typeof chunk === 'number' ? String(chunk) : chunk.friendly_id
  return `/admin/stories/${storySlug}/chunks/${chunkSlug}`
}

export function formatChunkLabel(
  chunkIndex: number,
  chunkCount: number,
  chunkFriendlyId?: string | null
): string {
  if (chunkFriendlyId?.trim()) return chunkFriendlyId.trim()
  return `Chunk ${chunkIndex + 1} of ${chunkCount}`
}
