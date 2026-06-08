import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveStoryUuid } from '@/lib/admin/resolve-story-id'

export async function resolveStoryIdParam(
  supabase: SupabaseClient,
  routeId: string
): Promise<{ storyUuid: string } | { response: NextResponse }> {
  const id = routeId?.trim()
  if (!id) {
    return {
      response: NextResponse.json(
        { data: null, error: { message: 'Missing story ID' } },
        { status: 400 }
      ),
    }
  }

  const storyUuid = await resolveStoryUuid(supabase, id)
  if (!storyUuid) {
    return {
      response: NextResponse.json(
        { data: null, error: { message: 'Story not found', code: 'NOT_FOUND' } },
        { status: 404 }
      ),
    }
  }

  return { storyUuid }
}
