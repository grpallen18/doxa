import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getPipelineStep,
  type PipelineStepId,
  type PromptKind,
} from '@/lib/admin/generated/pipeline-catalog'

const MAX_PROMPT_LENGTH = 64 * 1024

export type AgentPromptVersionSummary = {
  versionId: string
  versionNumber: number
  createdAt: string
  changeNote: string | null
  isActive: boolean
}

export type AgentPromptActiveVersion = {
  versionId: string
  versionNumber: number
  systemPrompt: string
  changeNote: string | null
  createdAt: string
  createdBy: string | null
}

export type AgentPromptSlotView = {
  stepId: string
  deployName: string
  label: string
  activeVersion: AgentPromptActiveVersion | null
}

export type AgentResponseSchemaView = {
  hasOverride: boolean
  updatedAt: string | null
  promptVersionId: string | null
}

export type AgentPromptSchemaMismatch = {
  mismatched: boolean
  message: string
}

export type AgentPromptResponse = {
  promptKind: PromptKind
  slot: AgentPromptSlotView | null
  userPayloadDoc: string | null
  recentVersions: AgentPromptVersionSummary[]
  responseSchema?: AgentResponseSchemaView
  schemaMismatch?: AgentPromptSchemaMismatch | null
}

export type AgentPromptAuditEvent = {
  actionId: string
  occurredAt: string
  actionType: string
  actorId: string | null
  promptVersionId: string | null
  detail: Record<string, unknown>
}

export function hashPromptContent(systemPrompt: string): string {
  return createHash('sha256').update(systemPrompt, 'utf8').digest('hex')
}

function catalogStep(stepId: string) {
  return getPipelineStep(stepId as PipelineStepId)
}

export async function fetchAgentPrompt(
  supabase: SupabaseClient,
  stepId: string
): Promise<AgentPromptResponse | null> {
  const catalog = catalogStep(stepId)
  if (!catalog) return null

  if (catalog.promptKind !== 'llm') {
    return {
      promptKind: catalog.promptKind,
      slot: null,
      userPayloadDoc: catalog.userPayloadDoc,
      recentVersions: [],
    }
  }

  const { data: slotRow } = await supabase
    .from('agent_prompt_slots')
    .select('step_id, deploy_name, label, active_version_id')
    .eq('step_id', stepId)
    .maybeSingle()

  const { data: versions } = await supabase
    .from('agent_prompt_versions')
    .select('version_id, version_number, system_prompt, change_note, created_at, created_by')
    .eq('step_id', stepId)
    .order('version_number', { ascending: false })
    .limit(50)

  const activeVersionId = slotRow?.active_version_id as string | null | undefined
  const activeRow = versions?.find((v) => v.version_id === activeVersionId)

  const slot: AgentPromptSlotView = {
    stepId,
    deployName: (slotRow?.deploy_name as string | undefined) ?? catalog.deployName,
    label: (slotRow?.label as string | undefined) ?? catalog.label,
    activeVersion: activeRow
      ? {
          versionId: activeRow.version_id as string,
          versionNumber: activeRow.version_number as number,
          systemPrompt: activeRow.system_prompt as string,
          changeNote: (activeRow.change_note as string | null) ?? null,
          createdAt: activeRow.created_at as string,
          createdBy: (activeRow.created_by as string | null) ?? null,
        }
      : null,
  }

  return {
    promptKind: 'llm',
    slot,
    userPayloadDoc: catalog.userPayloadDoc,
    recentVersions: (versions ?? []).map((v) => ({
      versionId: v.version_id as string,
      versionNumber: v.version_number as number,
      createdAt: v.created_at as string,
      changeNote: (v.change_note as string | null) ?? null,
      isActive: v.version_id === activeVersionId,
    })),
  }
}

async function ensurePromptSlot(
  supabase: SupabaseClient,
  stepId: string
): Promise<{ error: string | null }> {
  const catalog = catalogStep(stepId)
  if (!catalog || catalog.promptKind !== 'llm') {
    return { error: 'Agent does not use an LLM prompt' }
  }

  const { data: existing } = await supabase
    .from('agent_prompt_slots')
    .select('step_id')
    .eq('step_id', stepId)
    .maybeSingle()

  if (existing) return { error: null }

  const { error } = await supabase.from('agent_prompt_slots').insert({
    step_id: stepId,
    deploy_name: catalog.deployName,
    label: catalog.label,
  })

  if (error) return { error: error.message }
  return { error: null }
}

export async function createAgentPromptVersion(
  supabase: SupabaseClient,
  stepId: string,
  input: {
    systemPrompt: string
    changeNote?: string
    activate?: boolean
    actorId: string
  }
): Promise<
  | { versionId: string; versionNumber: number; activated: boolean }
  | { error: string; status: number }
> {
  const catalog = catalogStep(stepId)
  if (!catalog || catalog.promptKind !== 'llm') {
    return { error: 'Agent does not use an LLM prompt', status: 400 }
  }

  const trimmed = input.systemPrompt.trim()
  if (!trimmed) return { error: 'systemPrompt is required', status: 400 }
  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return { error: `systemPrompt exceeds ${MAX_PROMPT_LENGTH} characters`, status: 400 }
  }

  const activate = input.activate !== false
  const contentHash = hashPromptContent(trimmed)

  const slotResult = await ensurePromptSlot(supabase, stepId)
  if (slotResult.error) return { error: slotResult.error, status: 500 }

  const { data: slot } = await supabase
    .from('agent_prompt_slots')
    .select('active_version_id')
    .eq('step_id', stepId)
    .single()

  if (slot?.active_version_id) {
    const { data: activeVersion } = await supabase
      .from('agent_prompt_versions')
      .select('content_hash')
      .eq('version_id', slot.active_version_id)
      .maybeSingle()

    if (activeVersion?.content_hash === contentHash) {
      return { error: 'No changes from active version', status: 409 }
    }
  }

  const { data: maxRow } = await supabase
    .from('agent_prompt_versions')
    .select('version_number')
    .eq('step_id', stepId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const versionNumber = ((maxRow?.version_number as number | undefined) ?? 0) + 1

  const { data: inserted, error: insertError } = await supabase
    .from('agent_prompt_versions')
    .insert({
      step_id: stepId,
      version_number: versionNumber,
      system_prompt: trimmed,
      content_hash: contentHash,
      change_note: input.changeNote?.trim() || null,
      created_by: input.actorId,
    })
    .select('version_id, version_number')
    .single()

  if (insertError || !inserted) {
    return { error: insertError?.message ?? 'Failed to create version', status: 500 }
  }

  const versionId = inserted.version_id as string

  await supabase.from('admin_pipeline_actions').insert({
    actor_id: input.actorId,
    action_type: 'prompt_version_created',
    step_id: stepId,
    prompt_version_id: versionId,
    detail: {
      version_number: versionNumber,
      change_note: input.changeNote?.trim() || null,
      activated: activate,
    },
  })

  if (activate) {
    const activateResult = await activateAgentPromptVersion(supabase, stepId, {
      versionId,
      actorId: input.actorId,
    })
    if ('error' in activateResult) {
      return { error: activateResult.error, status: activateResult.status }
    }
  }

  return {
    versionId,
    versionNumber: inserted.version_number as number,
    activated: activate,
  }
}

export async function activateAgentPromptVersion(
  supabase: SupabaseClient,
  stepId: string,
  input: { versionId: string; actorId: string }
): Promise<{ activated: boolean } | { error: string; status: number }> {
  const { data: version } = await supabase
    .from('agent_prompt_versions')
    .select('version_id, version_number, step_id')
    .eq('version_id', input.versionId)
    .maybeSingle()

  if (!version || version.step_id !== stepId) {
    return { error: 'Version not found for this agent', status: 404 }
  }

  const { data: slot } = await supabase
    .from('agent_prompt_slots')
    .select('active_version_id')
    .eq('step_id', stepId)
    .maybeSingle()

  const fromVersionId = (slot?.active_version_id as string | null) ?? null
  if (fromVersionId === input.versionId) {
    return { activated: true }
  }

  const { error: updateError } = await supabase
    .from('agent_prompt_slots')
    .update({
      active_version_id: input.versionId,
      updated_at: new Date().toISOString(),
    })
    .eq('step_id', stepId)

  if (updateError) {
    return { error: updateError.message, status: 500 }
  }

  let fromVersionNumber: number | null = null
  if (fromVersionId) {
    const { data: fromVersion } = await supabase
      .from('agent_prompt_versions')
      .select('version_number')
      .eq('version_id', fromVersionId)
      .maybeSingle()
    fromVersionNumber = (fromVersion?.version_number as number | undefined) ?? null
  }

  const isRollback =
    fromVersionNumber !== null && (version.version_number as number) < fromVersionNumber

  await supabase.from('admin_pipeline_actions').insert({
    actor_id: input.actorId,
    action_type: isRollback ? 'prompt_version_rollback' : 'prompt_version_activated',
    step_id: stepId,
    prompt_version_id: input.versionId,
    detail: {
      from_version_id: fromVersionId,
      to_version_id: input.versionId,
      version_number: version.version_number,
    },
  })

  return { activated: true }
}

export type AgentPromptAuditPageResult = {
  events: AgentPromptAuditEvent[]
  total: number
}

export async function fetchAgentPromptAudit(
  supabase: SupabaseClient,
  stepId: string,
  pagination: { limit: number; offset: number }
): Promise<AgentPromptAuditPageResult> {
  const { data, count } = await supabase
    .from('admin_pipeline_actions')
    .select('action_id, occurred_at, action_type, actor_id, prompt_version_id, detail', {
      count: 'exact',
    })
    .eq('step_id', stepId)
    .order('occurred_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1)

  const events = (data ?? []).map((row) => ({
    actionId: row.action_id as string,
    occurredAt: row.occurred_at as string,
    actionType: row.action_type as string,
    actorId: (row.actor_id as string | null) ?? null,
    promptVersionId: (row.prompt_version_id as string | null) ?? null,
    detail: (row.detail as Record<string, unknown>) ?? {},
  }))

  return { events, total: count ?? events.length }
}

export async function fetchVersionPrompt(
  supabase: SupabaseClient,
  stepId: string,
  versionId: string
): Promise<{ systemPrompt: string; versionNumber: number } | null> {
  const { data } = await supabase
    .from('agent_prompt_versions')
    .select('system_prompt, version_number')
    .eq('step_id', stepId)
    .eq('version_id', versionId)
    .maybeSingle()

  if (!data) return null
  return {
    systemPrompt: data.system_prompt as string,
    versionNumber: data.version_number as number,
  }
}
