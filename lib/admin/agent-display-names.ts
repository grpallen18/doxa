import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { getAgentProfileCopy } from '@/lib/admin/agent-profile-copy'
import type { AgentDetail } from '@/lib/admin/agent-detail'
import { getFlowNodeLabel } from '@/lib/admin/pipeline-flow-labels'

export type AgentDisplayNameMap = Record<string, string>

export type AgentProfileOverrideRow = {
  displayName: string | null
  jobTitle: string | null
  bio: string | null
}

export type AgentProfileField = 'displayName' | 'jobTitle' | 'bio'

export type ResolvedAgentProfile = {
  displayName: string
  defaultDisplayName: string
  displayNameOverride: string | null
  jobTitle: string
  defaultJobTitle: string
  jobTitleOverride: string | null
  bio: string
  defaultBio: string
  bioOverride: string | null
}

export const AGENT_DISPLAY_NAME_MAX_LENGTH = 120
export const AGENT_JOB_TITLE_MAX_LENGTH = 120
export const AGENT_BIO_MAX_LENGTH = 500

const FIELD_LIMITS: Record<AgentProfileField, number> = {
  displayName: AGENT_DISPLAY_NAME_MAX_LENGTH,
  jobTitle: AGENT_JOB_TITLE_MAX_LENGTH,
  bio: AGENT_BIO_MAX_LENGTH,
}

type DbRow = {
  step_id: string
  display_name: string | null
  job_title: string | null
  bio: string | null
}

function rowToOverrides(row: DbRow | null | undefined): AgentProfileOverrideRow {
  if (!row) {
    return { displayName: null, jobTitle: null, bio: null }
  }
  return {
    displayName: row.display_name?.trim() || null,
    jobTitle: row.job_title?.trim() || null,
    bio: row.bio?.trim() || null,
  }
}

function isRowEmpty(overrides: AgentProfileOverrideRow): boolean {
  return !overrides.displayName && !overrides.jobTitle && !overrides.bio
}

export function resolveAgentDisplayName(
  stepId: PipelineStepId | string,
  catalogLabel: string,
  overrides?: AgentDisplayNameMap | null
): string {
  const override = overrides?.[stepId]?.trim()
  if (override) return override
  return getFlowNodeLabel(stepId as PipelineStepId, catalogLabel)
}

export function resolveAgentProfile(
  agent: AgentDetail,
  overrides?: AgentProfileOverrideRow | null
): ResolvedAgentProfile {
  const defaults = getAgentProfileCopy(agent)
  const defaultDisplayName = getFlowNodeLabel(agent.stepId, agent.label)

  return {
    displayName: overrides?.displayName ?? defaults.displayName,
    defaultDisplayName,
    displayNameOverride: overrides?.displayName ?? null,
    jobTitle: overrides?.jobTitle ?? defaults.jobTitle,
    defaultJobTitle: defaults.jobTitle,
    jobTitleOverride: overrides?.jobTitle ?? null,
    bio: overrides?.bio ?? defaults.bio,
    defaultBio: defaults.bio,
    bioOverride: overrides?.bio ?? null,
  }
}

export async function fetchAllAgentDisplayNames(
  supabase: SupabaseClient
): Promise<AgentDisplayNameMap> {
  const { data, error } = await supabase
    .from('admin_agent_display_names')
    .select('step_id, display_name')

  if (error || !data) return {}

  const map: AgentDisplayNameMap = {}
  for (const row of data) {
    const stepId = row.step_id as string
    const displayName = (row.display_name as string | null)?.trim()
    if (stepId && displayName) map[stepId] = displayName
  }
  return map
}

export async function fetchAgentProfileOverrides(
  supabase: SupabaseClient,
  stepId: string
): Promise<AgentProfileOverrideRow> {
  const { data } = await supabase
    .from('admin_agent_display_names')
    .select('display_name, job_title, bio')
    .eq('step_id', stepId)
    .maybeSingle()

  return rowToOverrides(data as DbRow | null)
}

export function validateAgentProfileFieldInput(
  field: AgentProfileField,
  value: string
): string | { error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { error: 'Value is required' }
  const max = FIELD_LIMITS[field]
  if (trimmed.length > max) {
    return { error: `Must be ${max} characters or fewer` }
  }
  return trimmed
}

export async function patchAgentProfileField(
  supabase: SupabaseClient,
  agent: AgentDetail,
  field: AgentProfileField,
  value: string | null,
  actorId: string
): Promise<ResolvedAgentProfile | { error: string }> {
  const resolvedDefaults = resolveAgentProfile(agent)
  const defaultValue =
    field === 'displayName'
      ? resolvedDefaults.defaultDisplayName
      : field === 'jobTitle'
        ? resolvedDefaults.defaultJobTitle
        : resolvedDefaults.defaultBio

  const { data: existingRow } = await supabase
    .from('admin_agent_display_names')
    .select('display_name, job_title, bio')
    .eq('step_id', agent.stepId)
    .maybeSingle()

  const current = rowToOverrides(existingRow as DbRow | null)

  let nextValue: string | null = null
  if (value !== null) {
    const validated = validateAgentProfileFieldInput(field, value)
    if (typeof validated !== 'string') return { error: validated.error }
    nextValue = validated === defaultValue ? null : validated
  }

  const next: AgentProfileOverrideRow = {
    ...current,
    [field]: nextValue,
  }

  if (isRowEmpty(next)) {
    const { error } = await supabase
      .from('admin_agent_display_names')
      .delete()
      .eq('step_id', agent.stepId)
    if (error) return { error: error.message }
    return resolveAgentProfile(agent)
  }

  const { error } = await supabase.from('admin_agent_display_names').upsert(
    {
      step_id: agent.stepId,
      display_name: next.displayName,
      job_title: next.jobTitle,
      bio: next.bio,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: 'step_id' }
  )

  if (error) return { error: error.message }
  return resolveAgentProfile(agent, next)
}

export async function patchAgentProfileFields(
  supabase: SupabaseClient,
  agent: AgentDetail,
  patch: Partial<Record<AgentProfileField, string | null>>,
  actorId: string
): Promise<ResolvedAgentProfile | { error: string }> {
  let result: ResolvedAgentProfile | { error: string } = resolveAgentProfile(agent)
  for (const field of ['displayName', 'jobTitle', 'bio'] as const) {
    if (!(field in patch)) continue
    const step = await patchAgentProfileField(
      supabase,
      agent,
      field,
      patch[field] ?? null,
      actorId
    )
    if ('error' in step) return step
    result = step
  }
  return result
}
