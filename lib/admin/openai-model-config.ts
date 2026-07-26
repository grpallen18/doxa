import type { SupabaseClient } from '@supabase/supabase-js'
import { edgeFunctionHeaders } from '@/lib/supabase/edge-function-auth'
import {
  buildOpenAiModelCatalog,
  isEditableOpenAiModelKey,
  validateModelValue,
  type OpenAiModelKeyMeta,
} from '@/lib/admin/openai-model-catalog'

export const TEST_OPENAI_MODEL_DEPLOY = 'test_openai_model'

export type ResolvedOpenAiModelEntry = OpenAiModelKeyMeta & {
  configuredValue: string | null
  effectiveValue: string
  /** Catalog default label; `label` is the effective (override or catalog) name. */
  catalogLabel: string
  /** Catalog default description; `description` is the effective override or catalog text. */
  catalogDescription: string
  updatedAt: string | null
}

export type OpenAiModelDisplayFields = {
  label?: string
  description?: string
}

export type OpenAiModelTestResult = {
  ok: boolean
  message: string
  latencyMs?: number
}

function supabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) return null
  try {
    const host = new URL(url).hostname
    return host.split('.')[0] ?? null
  } catch {
    return null
  }
}

export function isSupabaseSecretsSyncConfigured(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim() && supabaseProjectRef())
}

function normalizeDisplayText(
  value: string | null | undefined,
  maxLen: number
): string | null | { error: string } {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return { error: 'Value cannot be empty' }
  if (trimmed.length > maxLen) {
    return { error: `Value must be ${maxLen} characters or fewer` }
  }
  return trimmed
}

export async function fetchResolvedOpenAiModels(
  supabase: SupabaseClient
): Promise<ResolvedOpenAiModelEntry[]> {
  const { data, error } = await supabase
    .from('admin_openai_model_config')
    .select('config_key, model_value, display_label, display_description, updated_at')

  const configured: Record<
    string,
    { value: string; label: string | null; description: string | null; updatedAt: string }
  > = {}

  if (!error && data) {
    for (const row of data) {
      const key = row.config_key as string
      const value = (row.model_value as string | null)?.trim()
      if (key && value) {
        configured[key] = {
          value,
          label: (row.display_label as string | null)?.trim() || null,
          description: (row.display_description as string | null)?.trim() || null,
          updatedAt: row.updated_at as string,
        }
      }
    }
  }

  return buildOpenAiModelCatalog().map((entry) => {
    const row = configured[entry.key]
    const configuredValue = row?.value ?? null
    return {
      ...entry,
      catalogLabel: entry.label,
      catalogDescription: entry.description,
      label: row?.label ?? entry.label,
      description: row?.description ?? entry.description,
      configuredValue,
      effectiveValue: configuredValue ?? entry.codeDefault,
      updatedAt: row?.updatedAt ?? null,
    }
  })
}

function extractEdgeError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const record = data as { error?: string; message?: string }
    if (record.message?.trim()) return record.message.trim()
    if (record.error?.trim()) return record.error.trim()
  }
  return `Model test failed (${status})`
}

export async function invokeTestOpenAiModelEdge(
  configKey: string,
  model: string
): Promise<OpenAiModelTestResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      message: 'Server not configured for Edge Function calls (Supabase URL / service role key).',
    }
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${TEST_OPENAI_MODEL_DEPLOY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...edgeFunctionHeaders(serviceKey),
      },
      body: JSON.stringify({ config_key: configKey, model }),
      signal: AbortSignal.timeout(60_000),
    })

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      message?: string
      latencyMs?: number
      error?: string
    }

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        message: extractEdgeError(data, res.status),
        latencyMs: data.latencyMs,
      }
    }

    return {
      ok: true,
      message: data.message ?? `Model "${model}" verified.`,
      latencyMs: data.latencyMs,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Model test request failed'
    return { ok: false, message }
  }
}

export async function syncOpenAiSecretsToEdge(
  updates: Record<string, string>
): Promise<{ ok: boolean; message: string }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  const projectRef = supabaseProjectRef()

  if (!token || !projectRef) {
    return {
      ok: false,
      message:
        'Set SUPABASE_ACCESS_TOKEN in .env.local to push secrets to Edge Functions automatically, or run supabase secrets set manually.',
    }
  }

  const payload = Object.entries(updates).map(([name, value]) => ({ name, value }))

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    return {
      ok: false,
      message: `Supabase secrets sync failed (${res.status}): ${text.slice(0, 240)}`,
    }
  }

  return { ok: true, message: 'Edge Function secrets updated.' }
}

async function restorePreviousModelConfig(
  supabase: SupabaseClient,
  key: string,
  previousValue: string | null,
  previousLabel: string | null,
  previousDescription: string | null,
  actorId: string
): Promise<void> {
  if (previousValue) {
    await supabase.from('admin_openai_model_config').upsert(
      {
        config_key: key,
        model_value: previousValue,
        display_label: previousLabel,
        display_description: previousDescription,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: 'config_key' }
    )
    return
  }

  await supabase.from('admin_openai_model_config').delete().eq('config_key', key)
}

export async function applyOpenAiModelConfig(
  supabase: SupabaseClient,
  key: string,
  value: string,
  actorId: string,
  display: OpenAiModelDisplayFields = {}
): Promise<
  | {
      entry: ResolvedOpenAiModelEntry
      test: OpenAiModelTestResult | null
      sync: { ok: boolean; message: string } | null
      warning?: string
    }
  | { error: string }
> {
  if (!isEditableOpenAiModelKey(key)) {
    return { error: 'Unknown or non-editable model key' }
  }

  const validated = validateModelValue(value)
  if (typeof validated !== 'string') {
    return { error: validated.error }
  }

  const labelResult = normalizeDisplayText(display.label, 120)
  if (labelResult && typeof labelResult === 'object' && 'error' in labelResult) {
    return { error: `Friendly name: ${labelResult.error}` }
  }

  const descriptionResult = normalizeDisplayText(display.description, 500)
  if (descriptionResult && typeof descriptionResult === 'object' && 'error' in descriptionResult) {
    return { error: `Description: ${descriptionResult.error}` }
  }

  const catalog = await fetchResolvedOpenAiModels(supabase)
  const current = catalog.find((item) => item.key === key)
  if (!current) {
    return { error: 'Unknown model key' }
  }

  const nextLabel = (labelResult as string | null) ?? current.label
  const nextDescription = (descriptionResult as string | null) ?? current.description
  const valueChanged = validated !== current.effectiveValue
  const labelChanged = nextLabel !== current.label
  const descriptionChanged = nextDescription !== current.description

  if (!valueChanged && !labelChanged && !descriptionChanged) {
    return { error: 'No change to save' }
  }

  const previousConfiguredValue = current.configuredValue
  const displayLabelToStore = nextLabel === current.catalogLabel ? null : nextLabel
  const displayDescriptionToStore =
    nextDescription === current.catalogDescription ? null : nextDescription
  const modelValueForDisplaySave = current.configuredValue ?? current.effectiveValue

  let test: OpenAiModelTestResult | null = null
  let sync: { ok: boolean; message: string } | null = null

  // Persist friendly name / description first so they survive a failed technical test.
  if (labelChanged || descriptionChanged) {
    const { error: displayError } = await supabase.from('admin_openai_model_config').upsert(
      {
        config_key: key,
        model_value: modelValueForDisplaySave,
        display_label: displayLabelToStore,
        display_description: displayDescriptionToStore,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: 'config_key' }
    )
    if (displayError) {
      return { error: displayError.message }
    }
  }

  if (valueChanged) {
    test = await invokeTestOpenAiModelEdge(key, validated)
    if (!test.ok) {
      const updatedCatalog = await fetchResolvedOpenAiModels(supabase)
      const entry = updatedCatalog.find((item) => item.key === key)
      if (!entry) {
        return { error: test.message }
      }
      if (labelChanged || descriptionChanged) {
        return {
          entry,
          test,
          sync: { ok: true, message: 'Display metadata saved.' },
          warning: `Friendly name/description saved. Technical model rejected: ${test.message}`,
        }
      }
      return { error: test.message }
    }

    const { error: upsertError } = await supabase.from('admin_openai_model_config').upsert(
      {
        config_key: key,
        model_value: validated,
        display_label: displayLabelToStore,
        display_description: displayDescriptionToStore,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
      },
      { onConflict: 'config_key' }
    )

    if (upsertError) {
      return { error: upsertError.message }
    }

    sync = await syncOpenAiSecretsToEdge({ [key]: validated })
    if (!sync.ok && process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
      await restorePreviousModelConfig(
        supabase,
        key,
        previousConfiguredValue,
        displayLabelToStore,
        displayDescriptionToStore,
        actorId
      )
      const updatedCatalog = await fetchResolvedOpenAiModels(supabase)
      const entry = updatedCatalog.find((item) => item.key === key)
      if (entry && (labelChanged || descriptionChanged)) {
        return {
          entry,
          test,
          sync,
          warning: `Friendly name/description saved. Technical model rolled back: ${sync.message}`,
        }
      }
      return {
        error: `${sync.message} Change was rolled back to the previous value.`,
      }
    }
  } else {
    sync = { ok: true, message: 'Display metadata saved.' }
  }

  const updatedCatalog = await fetchResolvedOpenAiModels(supabase)
  const entry = updatedCatalog.find((item) => item.key === key)

  if (!entry) {
    return { error: 'Saved but failed to reload config' }
  }

  return { entry, test, sync }
}
