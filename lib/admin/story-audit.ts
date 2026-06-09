import type { SupabaseClient } from '@supabase/supabase-js'
import {
  appendStoryHistory,
  fetchStoryHistory,
  type HistoryEvent,
  type HistoryEventType,
  type HistoryPageResult,
} from '@/lib/admin/history'
import type { PaginationParams } from '@/lib/admin/pagination'

export type StoryAuditEvent = HistoryEvent
export type StoryAuditEventType = Extract<HistoryEventType, 'field_change' | 'admin_action' | 'pipeline_step'>

export async function fetchStoryAuditEvents(
  supabase: SupabaseClient,
  storyId: string,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchStoryHistory(supabase, storyId, pagination)
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

export async function logStoryPipelineStepRun(
  supabase: SupabaseClient,
  params: {
    storyId: string
    stepId: string
    stepLabel: string
    deployName: string
    actorId: string
    result?: Record<string, unknown>
  }
): Promise<string> {
  const processed =
    typeof params.result?.processed === 'number' ? params.result.processed : null
  const runId = typeof params.result?.run_id === 'string' ? params.result.run_id : null
  const summary =
    processed != null
      ? `${params.stepLabel} · ${processed} processed`
      : params.stepLabel

  return appendStoryAuditEvent(supabase, {
    storyId: params.storyId,
    eventType: 'pipeline_step',
    label: 'Pipeline step run',
    detail: params.stepId,
    meta: {
      field: 'Pipeline step',
      step_id: params.stepId,
      deploy_name: params.deployName,
      processed,
      run_id: runId,
      new: summary,
    },
    actorId: params.actorId,
    source: 'api:run-step',
  })
}
