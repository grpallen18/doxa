import type { SupabaseClient } from '@supabase/supabase-js'

export type EventRecordHub = {
  event_id: string
  canonical_text: string
  primary_actor: string | null
  action: string | null
  object: string | null
  event_date: string | null
  location: string | null
  event_type: string | null
  created_at: string
  updated_at: string
  story_contributors: Array<{
    story_event_id: string
    story_id: string
    event_summary: string
    extraction_confidence: number
    story_title: string | null
    story_url: string | null
  }>
}

export async function fetchEventRecordHub(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventRecordHub | null> {
  const { data: event, error } = await supabase
    .from('events')
    .select(
      'event_id, canonical_text, primary_actor, action, object, event_date, location, event_type, created_at, updated_at'
    )
    .eq('event_id', eventId)
    .single()

  if (error || !event) return null

  const { data: storyEvents } = await supabase
    .from('story_events')
    .select(
      'story_event_id, story_id, event_summary, extraction_confidence, stories(title, url)'
    )
    .eq('event_id', eventId)

  const story_contributors = (storyEvents ?? []).map((row) => {
    const stories = row.stories as { title?: string; url?: string } | null
    return {
      story_event_id: row.story_event_id as string,
      story_id: row.story_id as string,
      event_summary: row.event_summary as string,
      extraction_confidence: Number(row.extraction_confidence),
      story_title: stories?.title ?? null,
      story_url: stories?.url ?? null,
    }
  })

  return {
    event_id: event.event_id as string,
    canonical_text: event.canonical_text as string,
    primary_actor: event.primary_actor as string | null,
    action: event.action as string | null,
    object: event.object as string | null,
    event_date: event.event_date as string | null,
    location: event.location as string | null,
    event_type: event.event_type as string | null,
    created_at: event.created_at as string,
    updated_at: event.updated_at as string,
    story_contributors,
  }
}
