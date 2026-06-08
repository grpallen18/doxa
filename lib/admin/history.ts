import type { SupabaseClient } from '@supabase/supabase-js'

export type HistoryEventType =
  | 'field_change'
  | 'admin_action'
  | 'pipeline_step'
  | 'created'
  | 'deleted'

export type HistoryEvent = {
  id: string
  at: string
  eventType: HistoryEventType
  label: string
  field: string | null
  previousValue: string | null
  newValue: string | null
  actorId: string | null
  actorLabel: string | null
  source: string | null
}

export function sortHistoryEvents(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

export function formatHistoryFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatHistoryTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatHistoryValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

function parseDetailTransition(detail: string | null): {
  previousValue: string | null
  newValue: string | null
} {
  if (!detail) return { previousValue: null, newValue: null }
  const arrow = ' → '
  const index = detail.indexOf(arrow)
  if (index === -1) return { previousValue: null, newValue: detail }
  return {
    previousValue: detail.slice(0, index) || null,
    newValue: detail.slice(index + arrow.length) || null,
  }
}

function parseHistoryMeta(
  meta: Record<string, unknown> | null | undefined,
  detail: string | null,
  label: string
): Pick<HistoryEvent, 'field' | 'previousValue' | 'newValue'> {
  const record = meta ?? {}
  const fieldKey = typeof record.field === 'string' ? record.field : null
  let previousValue = formatHistoryValue(record.old)
  let newValue = formatHistoryValue(record.new)

  if (previousValue == null && 'had_extraction' in record) {
    previousValue = formatHistoryValue(record.had_extraction)
    newValue = formatHistoryValue(record.has_extraction)
  }

  if (previousValue == null && newValue == null) {
    const transition = parseDetailTransition(detail)
    previousValue = transition.previousValue
    newValue = transition.newValue
  }

  const field = fieldKey ? formatHistoryFieldName(fieldKey) : label

  return { field, previousValue, newValue }
}

export function formatHistoryActor(event: HistoryEvent): string {
  if (event.actorLabel) return event.actorLabel
  if (event.actorId) return 'User'
  if (isAgentHistoryEvent(event)) return 'Agent'
  return '—'
}

export function isAgentHistoryEvent(event: HistoryEvent): boolean {
  if (event.eventType === 'pipeline_step') return true
  const source = event.source ?? ''
  if (source.startsWith('trigger:')) return true
  if (source.startsWith('rpc:')) return true
  if (!event.actorId && event.eventType !== 'admin_action') return true
  return false
}

type HistoryRow = {
  id: string
  occurred_at: string
  event_type: HistoryEventType
  label: string
  detail: string | null
  meta: Record<string, unknown> | null
  actor_id: string | null
  source: string | null
}

function mapHistoryRows(rows: HistoryRow[]): HistoryEvent[] {
  return rows.map((row) => {
    if (row.event_type === 'created') {
      return {
        id: `history-${row.id}`,
        at: row.occurred_at,
        eventType: row.event_type,
        label: row.label,
        field: 'Created Date',
        previousValue: null,
        newValue: formatHistoryTimestamp(row.occurred_at),
        actorId: row.actor_id,
        actorLabel: null,
        source: row.source,
      }
    }

    const parsed = parseHistoryMeta(row.meta, row.detail, row.label)
    return {
      id: `history-${row.id}`,
      at: row.occurred_at,
      eventType: row.event_type,
      label: row.label,
      field: parsed.field,
      previousValue: parsed.previousValue,
      newValue: parsed.newValue,
      actorId: row.actor_id,
      actorLabel: null,
      source: row.source,
    }
  })
}

async function enrichHistoryActors(
  supabase: SupabaseClient,
  events: HistoryEvent[]
): Promise<HistoryEvent[]> {
  const actorIds = [...new Set(events.map((event) => event.actorId).filter(Boolean))] as string[]
  if (actorIds.length === 0) return events

  const labels = new Map<string, string>()
  await Promise.all(
    actorIds.map(async (actorId) => {
      const { data, error } = await supabase.auth.admin.getUserById(actorId)
      if (error || !data.user) return
      const user = data.user
      const name =
        (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
        user.email ||
        null
      if (name) labels.set(actorId, name)
    })
  )

  return events.map((event) =>
    event.actorId && labels.has(event.actorId)
      ? { ...event, actorLabel: labels.get(event.actorId)! }
      : event
  )
}

export async function fetchStoryHistory(
  supabase: SupabaseClient,
  storyId: string,
  limit = 100
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('story_history')
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source')
    .eq('story_id', storyId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return enrichHistoryActors(supabase, mapHistoryRows((data ?? []) as HistoryRow[]))
}

export async function fetchStoryChunksHistory(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  limit = 100
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('story_chunks_history')
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source')
    .eq('story_id', storyId)
    .eq('chunk_index', chunkIndex)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return enrichHistoryActors(supabase, mapHistoryRows((data ?? []) as HistoryRow[]))
}

export async function fetchClaimsHistory(
  supabase: SupabaseClient,
  claimId: string,
  limit = 100
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('claims_history')
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source')
    .eq('claim_id', claimId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return enrichHistoryActors(supabase, mapHistoryRows((data ?? []) as HistoryRow[]))
}

export async function fetchEventsHistory(
  supabase: SupabaseClient,
  eventId: string,
  limit = 100
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('events_history')
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source')
    .eq('event_id', eventId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return enrichHistoryActors(supabase, mapHistoryRows((data ?? []) as HistoryRow[]))
}

export async function fetchPositionsHistory(
  supabase: SupabaseClient,
  canonicalPositionId: string,
  limit = 100
): Promise<HistoryEvent[]> {
  const { data, error } = await supabase
    .from('positions_history')
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source')
    .eq('canonical_position_id', canonicalPositionId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return enrichHistoryActors(supabase, mapHistoryRows((data ?? []) as HistoryRow[]))
}

export async function appendStoryHistory(
  supabase: SupabaseClient,
  params: {
    storyId: string
    eventType: HistoryEventType
    label: string
    detail?: string | null
    meta?: Record<string, unknown>
    actorId?: string | null
    source?: string | null
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('append_story_history', {
    p_story_id: params.storyId,
    p_event_type: params.eventType,
    p_label: params.label,
    p_detail: params.detail ?? null,
    p_meta: params.meta ?? {},
    p_actor_id: params.actorId ?? null,
    p_source: params.source ?? null,
  })

  if (error) throw error
  return data as string
}
