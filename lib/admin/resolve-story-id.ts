import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isStoryFriendlyId,
  isUuid,
  normalizeStoryFriendlyId,
} from '@/lib/admin/friendly-id'

/** Resolve a route or API id (UUID or S-XXXXXXXX) to stories.story_id UUID. */
export async function resolveStoryUuid(
  supabase: SupabaseClient,
  routeId: string
): Promise<string | null> {
  const id = routeId.trim()
  if (!id) return null

  if (isUuid(id)) {
    const { data, error } = await supabase
      .from('stories')
      .select('story_id')
      .eq('story_id', id)
      .maybeSingle()
    if (error) throw error
    return (data?.story_id as string | undefined) ?? null
  }

  if (isStoryFriendlyId(id)) {
    const { data, error } = await supabase
      .from('stories')
      .select('story_id')
      .eq('friendly_id', normalizeStoryFriendlyId(id))
      .maybeSingle()
    if (error) throw error
    return (data?.story_id as string | undefined) ?? null
  }

  return null
}
