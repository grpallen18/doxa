import type { SupabaseClient } from '@supabase/supabase-js'
import { isChunkFriendlyId, normalizeChunkFriendlyId } from '@/lib/admin/friendly-id'

/** Resolve a route chunk ref (K-XXXXXXXX or 0-based index) within a story. */
export async function resolveChunkIndex(
  supabase: SupabaseClient,
  storyId: string,
  chunkRef: string
): Promise<number | null> {
  const ref = chunkRef.trim()
  if (!ref) return null

  if (isChunkFriendlyId(ref)) {
    const { data, error } = await supabase
      .from('story_chunks')
      .select('chunk_index')
      .eq('story_id', storyId)
      .eq('friendly_id', normalizeChunkFriendlyId(ref))
      .maybeSingle()
    if (error) throw error
    return data?.chunk_index != null ? Number(data.chunk_index) : null
  }

  const index = Number.parseInt(ref, 10)
  if (Number.isNaN(index) || index < 0) return null

  const { data, error } = await supabase
    .from('story_chunks')
    .select('chunk_index')
    .eq('story_id', storyId)
    .eq('chunk_index', index)
    .maybeSingle()
  if (error) throw error
  return data?.chunk_index != null ? Number(data.chunk_index) : null
}
