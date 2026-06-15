import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildOpenAiSchemaFromPrompt,
  openAiSchemaNameForStep,
  specFromOpenAiSchema,
} from '@/lib/admin/prompt-schema-builder'
import type { EnforcedOutputSpec } from '@/lib/admin/agent-prompt-schema-match'
import { ENFORCED_OUTPUT_SPECS } from '@/lib/admin/agent-prompt-schema-match'
import {
  extractOutputJsonBlock,
  extractRecommendedActions,
  firstArrayItemKeys,
  topLevelKeysFromJsonExample,
} from '@/lib/admin/prompt-output-parse'

export type PromptSchemaMismatch = {
  mismatched: boolean
  message: string
}

export type AgentResponseSchemaState = {
  hasOverride: boolean
  updatedAt: string | null
  promptVersionId: string | null
  schema: Record<string, unknown> | null
}

export type SchemaSyncResult =
  | { ok: true; schema: Record<string, unknown>; updatedAt: string }
  | { ok: false; error: string }

export function defaultCodeSchema(stepId: string): Record<string, unknown> | null {
  if (stepId === 'validate-chunk-claims') {
    // Mirrors CLAIMS_REVIEW_SCHEMA in doxa-agents; used only when no DB override exists.
    return {
      type: 'object',
      properties: {
        passes_review: { type: 'boolean' },
        recommended_action: {
          type: 'string',
          enum: ['validate', 'needs_refinement', 'reject'],
        },
        summary: { type: 'string' },
        issues: { type: 'array', items: { type: 'object' } },
        patches: { type: 'array', items: { type: 'object' } },
      },
      required: ['passes_review', 'recommended_action', 'summary', 'issues', 'patches'],
      additionalProperties: false,
    }
  }
  return null
}

export function getCodeEnforcedSpec(stepId: string): EnforcedOutputSpec | null {
  return ENFORCED_OUTPUT_SPECS[stepId] ?? null
}

export async function fetchAgentResponseSchemaState(
  supabase: SupabaseClient,
  stepId: string
): Promise<AgentResponseSchemaState> {
  const { data } = await supabase
    .from('agent_prompt_slots')
    .select(
      'response_json_schema, response_schema_prompt_version_id, response_schema_updated_at'
    )
    .eq('step_id', stepId)
    .maybeSingle()

  const schema = (data?.response_json_schema as Record<string, unknown> | null) ?? null

  return {
    hasOverride: schema != null,
    updatedAt: (data?.response_schema_updated_at as string | null) ?? null,
    promptVersionId: (data?.response_schema_prompt_version_id as string | null) ?? null,
    schema,
  }
}

export function getEffectiveEnforcedSpec(
  stepId: string,
  schemaState: AgentResponseSchemaState
): EnforcedOutputSpec | null {
  if (schemaState.schema) {
    return specFromOpenAiSchema(schemaState.schema)
  }
  return getCodeEnforcedSpec(stepId)
}

export function checkPromptOutputSchemaMatchWithSpec(
  systemPrompt: string,
  spec: EnforcedOutputSpec | null
): PromptSchemaMismatch | null {
  if (!spec) return null

  const jsonBlock = extractOutputJsonBlock(systemPrompt)
  if (!jsonBlock) {
    return {
      mismatched: true,
      message:
        'Active prompt has no OUTPUT JSON example. The runtime enforces a fixed response schema that may not match your prompt.',
    }
  }

  const promptTop = topLevelKeysFromJsonExample(jsonBlock)
  const promptTopSet = new Set(promptTop)
  const schemaTopSet = new Set(spec.topLevel)
  const promptOnlyTopLevel = promptTop.filter((k) => !schemaTopSet.has(k))
  const schemaOnlyTopLevel = spec.topLevel.filter((k) => !promptTopSet.has(k))

  const nestedMismatches: string[] = []
  for (const [arrayKey, schemaKeys] of Object.entries(spec.nested)) {
    const promptKeys = firstArrayItemKeys(jsonBlock, arrayKey)
    const promptKeySet = new Set(promptKeys)
    const schemaKeySet = new Set(schemaKeys)
    const promptOnly = promptKeys.filter((k) => !schemaKeySet.has(k))
    const schemaOnly = schemaKeys.filter((k) => !promptKeySet.has(k))
    if (promptOnly.length > 0) {
      nestedMismatches.push(`${arrayKey}[] prompt fields not in schema: ${promptOnly.join(', ')}`)
    }
    if (schemaOnly.length > 0) {
      nestedMismatches.push(`${arrayKey}[] schema fields missing from prompt: ${schemaOnly.join(', ')}`)
    }
  }

  let actionMismatch: string | null = null
  if (spec.recommendedActions?.length) {
    const promptActions = extractRecommendedActions(jsonBlock)
    if (promptActions.length > 0) {
      const schemaActionSet = new Set(spec.recommendedActions)
      const unknown = promptActions.filter((a) => !schemaActionSet.has(a))
      if (unknown.length > 0) {
        actionMismatch = `Prompt allows recommended_action [${promptActions.join(', ')}] but runtime schema allows [${spec.recommendedActions.join(', ')}].`
      }
    }
  }

  const mismatched =
    schemaOnlyTopLevel.length > 0 ||
    promptOnlyTopLevel.length > 0 ||
    nestedMismatches.length > 0 ||
    actionMismatch != null

  if (!mismatched) return null

  const parts = [
    'Active prompt OUTPUT shape does not match the enforced JSON schema. OpenAI will follow the schema, not the prompt example.',
  ]
  if (schemaOnlyTopLevel.length > 0) {
    parts.push(`Schema requires top-level fields missing from prompt: ${schemaOnlyTopLevel.join(', ')}.`)
  }
  if (promptOnlyTopLevel.length > 0) {
    parts.push(`Prompt example includes fields not in schema: ${promptOnlyTopLevel.join(', ')}.`)
  }
  parts.push(...nestedMismatches)
  if (actionMismatch) parts.push(actionMismatch)

  return { mismatched: true, message: parts.join(' ') }
}

export async function checkAgentPromptSchemaMatch(
  supabase: SupabaseClient,
  stepId: string,
  systemPrompt: string
): Promise<PromptSchemaMismatch | null> {
  const state = await fetchAgentResponseSchemaState(supabase, stepId)
  const spec = getEffectiveEnforcedSpec(stepId, state)
  return checkPromptOutputSchemaMatchWithSpec(systemPrompt, spec)
}

/** Compare a prompt's OUTPUT example against the current runtime schema (DB override or code default). */
export async function detectPromptSchemaMismatchForSave(
  supabase: SupabaseClient,
  stepId: string,
  systemPrompt: string
): Promise<PromptSchemaMismatch | null> {
  return checkAgentPromptSchemaMatch(supabase, stepId, systemPrompt)
}

export async function syncAgentResponseSchemaFromPrompt(
  supabase: SupabaseClient,
  stepId: string,
  input: {
    systemPrompt: string
    promptVersionId: string
    actorId?: string | null
  }
): Promise<SchemaSyncResult> {
  const built = buildOpenAiSchemaFromPrompt(stepId, input.systemPrompt)
  if (!built.ok) return { ok: false, error: built.error }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('agent_prompt_slots')
    .update({
      response_json_schema: built.schema,
      response_schema_prompt_version_id: input.promptVersionId,
      response_schema_updated_at: now,
      updated_at: now,
    })
    .eq('step_id', stepId)

  if (error) return { ok: false, error: error.message }

  await supabase.from('admin_pipeline_actions').insert({
    action_type: 'prompt_schema_synced',
    step_id: stepId,
    prompt_version_id: input.promptVersionId,
    actor_id: input.actorId ?? null,
    detail: {
      schema_name: built.schemaName,
      top_level: specFromOpenAiSchema(built.schema).topLevel,
    },
  })

  return { ok: true, schema: built.schema, updatedAt: now }
}
