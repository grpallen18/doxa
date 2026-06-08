import type { SupabaseClient } from '@supabase/supabase-js'
import {
  appendStoryHistory,
  fetchStoryHistory,
  type HistoryEvent,
  type HistoryEventType,
} from '@/lib/admin/history'

export type StoryAuditEvent = HistoryEvent
export type StoryAuditEventType = Extract<HistoryEventType, 'field_change' | 'admin_action' | 'pipeline_step'>

export async function fetchStoryAuditEvents(
  supabase: SupabaseClient,
  storyId: string
): Promise<StoryAuditEvent[]> {
  return fetchStoryHistory(supabase, storyId)
}

export async function appendStoryAuditEvent(
  supabase: SupabaseClient,
  params: {
    storyId: string
    eventType: StoryAuditEventType
    label: string
    detail?: string | null
    meta?: Record<string, unknown>
    actorId?: string | null
    source?: string | null
  }
): Promise<string> {
  return appendStoryHistory(supabase, params)
}
