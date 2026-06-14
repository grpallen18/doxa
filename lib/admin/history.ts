import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaginationParams } from '@/lib/admin/pagination'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { PIPELINE_STEPS, type PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { REVERT_SCOPE_STEP_IDS } from '@/lib/admin/pipeline-status/revert'

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
  return formatAdminDateTime(iso)
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

function pipelineStepLabel(stepId: string | null | undefined): string | null {
  if (!stepId) return null
  const step = PIPELINE_STEPS.find((s) => s.id === stepId)
  return step?.label ?? formatPipelineStepId(stepId)
}

function pipelineStepLabelFromSummary(summary: string | null): string | null {
  const stepName = stripPipelineStepOutcome(summary)
  if (!stepName) return null
  const byLabel = PIPELINE_STEPS.find(
    (s) => s.label.localeCompare(stepName, undefined, { sensitivity: 'accent' }) === 0
  )
  if (byLabel) return byLabel.label
  const normalized = stepName.toLowerCase().replace(/\s+/g, '-')
  return pipelineStepLabel(normalized)
}

function priorRevertScopeStepId(stepId: string): string | null {
  const idx = REVERT_SCOPE_STEP_IDS.indexOf(stepId as PipelineStepId)
  if (idx <= 0) return null
  return REVERT_SCOPE_STEP_IDS[idx - 1] ?? null
}

function formatPipelineStepId(stepId: string): string {
  return formatHistoryFieldName(stepId.replace(/-/g, ' '))
}

function stripPipelineStepOutcome(summary: string | null): string | null {
  if (!summary) return null
  const idx = summary.indexOf(' · ')
  return idx === -1 ? summary : summary.slice(0, idx) || null
}

function isPipelineStepHistoryLabel(label: string): boolean {
  return (
    label === 'Pipeline step run' ||
    label === 'Pipeline step failed' ||
    label === 'Pipeline step skipped' ||
    label === 'Pipeline step reverted'
  )
}

function parsePipelineStepHistoryMeta(
  meta: Record<string, unknown>,
  detail: string | null,
  label: string
): Pick<HistoryEvent, 'field' | 'previousValue' | 'newValue'> | null {
  const fieldKey = typeof meta.field === 'string' ? meta.field : null
  const isPipelineField = fieldKey?.toLowerCase() === 'pipeline step'
  if (!isPipelineField && !isPipelineStepHistoryLabel(label)) return null

  if (label === 'Pipeline step reverted') {
    const revertedStepId =
      (typeof meta.step_id === 'string' && meta.step_id) ||
      (detail?.trim() ? detail.trim() : null)
    const priorStepId =
      (typeof meta.previous_step_id === 'string' && meta.previous_step_id) ||
      (revertedStepId ? priorRevertScopeStepId(revertedStepId) : null)

    return {
      field: 'Pipeline Step',
      previousValue:
        pipelineStepLabel(revertedStepId) ??
        pipelineStepLabelFromSummary(formatHistoryValue(meta.old)) ??
        (formatHistoryValue(meta.old)
          ? stripPipelineStepOutcome(formatHistoryValue(meta.old))
          : null),
      newValue:
        pipelineStepLabel(priorStepId) ??
        pipelineStepLabelFromSummary(formatHistoryValue(meta.new)) ??
        (formatHistoryValue(meta.new)
          ? stripPipelineStepOutcome(formatHistoryValue(meta.new))
          : null),
    }
  }

  const stepId = typeof meta.step_id === 'string' ? meta.step_id : null
  const previousStepId =
    typeof meta.previous_step_id === 'string' ? meta.previous_step_id : null

  const previousValue =
    pipelineStepLabel(previousStepId) ??
    pipelineStepLabelFromSummary(formatHistoryValue(meta.old)) ??
    (formatHistoryValue(meta.old)
      ? stripPipelineStepOutcome(formatHistoryValue(meta.old))
      : null)

  const newValue =
    pipelineStepLabel(stepId) ??
    pipelineStepLabelFromSummary(formatHistoryValue(meta.new)) ??
    (formatHistoryValue(meta.new)
      ? stripPipelineStepOutcome(formatHistoryValue(meta.new))
      : null)

  return {
    field: 'Pipeline Step',
    previousValue,
    newValue,
  }
}

function enrichPipelineStepHistory(events: HistoryEvent[]): HistoryEvent[] {
  return events.map((event, index) => {
    if (event.field !== 'Pipeline Step' || event.previousValue) return event

    for (let j = index + 1; j < events.length; j++) {
      const older = events[j]
      if (older.field !== 'Pipeline Step') continue
      const previousStep = pipelineStepLabelFromSummary(older.newValue)
      if (previousStep) {
        return { ...event, previousValue: previousStep }
      }
    }

    return event
  })
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

  const pipelineParsed = parsePipelineStepHistoryMeta(record, detail, label)
  if (pipelineParsed) return pipelineParsed

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
  if (event.actorId) return false

  const source = event.source ?? ''
  if (source.startsWith('admin:') || source.startsWith('api:')) return false
  if (source.startsWith('trigger:stories:manual')) return false

  if (event.eventType === 'pipeline_step') return true
  if (source.startsWith('trigger:')) return true
  if (source.startsWith('cron:') || source.startsWith('schedule:')) return true
  if (source.startsWith('rpc:')) return true

  return event.eventType !== 'admin_action'
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

export type HistoryPageResult = {
  events: HistoryEvent[]
  total: number
}

async function fetchHistoryTablePage(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, string | number>,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  let query = supabase
    .from(table)
    .select('id, occurred_at, event_type, label, detail, meta, actor_id, source', {
      count: 'exact',
    })

  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value)
  }

  const { data, error, count } = await query
    .order('occurred_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1)

  if (error) throw error
  const mapped = mapHistoryRows((data ?? []) as HistoryRow[])
  const events = await enrichHistoryActors(
    supabase,
    table === 'story_history' ? enrichPipelineStepHistory(mapped) : mapped
  )
  return { events, total: count ?? 0 }
}

export async function fetchStoryHistory(
  supabase: SupabaseClient,
  storyId: string,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchHistoryTablePage(supabase, 'story_history', { story_id: storyId }, pagination)
}

export async function fetchStoryChunksHistory(
  supabase: SupabaseClient,
  storyId: string,
  chunkIndex: number,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchHistoryTablePage(
    supabase,
    'story_chunks_history',
    { story_id: storyId, chunk_index: chunkIndex },
    pagination
  )
}

export async function fetchClaimsHistory(
  supabase: SupabaseClient,
  claimId: string,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchHistoryTablePage(supabase, 'claims_history', { claim_id: claimId }, pagination)
}

export async function fetchEventsHistory(
  supabase: SupabaseClient,
  eventId: string,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchHistoryTablePage(supabase, 'events_history', { event_id: eventId }, pagination)
}

export async function fetchPositionsHistory(
  supabase: SupabaseClient,
  canonicalPositionId: string,
  pagination: PaginationParams
): Promise<HistoryPageResult> {
  return fetchHistoryTablePage(
    supabase,
    'positions_history',
    { canonical_position_id: canonicalPositionId },
    pagination
  )
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
