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
  updatedAt: string | null
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

export async function fetchResolvedOpenAiModels(
  supabase: SupabaseClient
): Promise<ResolvedOpenAiModelEntry[]> {
  const { data, error } = await supabase
    .from('admin_openai_model_config')
    .select('config_key, model_value, updated_at')

  const configured: Record<string, string> = {}
  const updatedAtByKey: Record<string, string> = {}

  if (!error && data) {
    for (const row of data) {
      const key = row.config_key as string
      const value = (row.model_value as string | null)?.trim()
      if (key && value) {
        configured[key] = value
        updatedAtByKey[key] = row.updated_at as string
      }
    }
  }

  return buildOpenAiModelCatalog().map((entry) => {
    const configuredValue = configured[entry.key] ?? null
    return {
      ...entry,
      configuredValue,
      effectiveValue: configuredValue ?? entry.codeDefault,
      updatedAt: updatedAtByKey[entry.key] ?? null,
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
  actorId: string
): Promise<void> {
  if (previousValue) {
    await supabase.from('admin_openai_model_config').upsert(
      {
        config_key: key,
        model_value: previousValue,
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
  actorId: string
): Promise<
  | {
      entry: ResolvedOpenAiModelEntry
      test: OpenAiModelTestResult
      sync: { ok: boolean; message: string }
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

  const catalog = await fetchResolvedOpenAiModels(supabase)
  const current = catalog.find((item) => item.key === key)
  if (!current) {
    return { error: 'Unknown model key' }
  }

  if (validated === current.effectiveValue) {
    return { error: 'No change to apply' }
  }

  const previousConfiguredValue = current.configuredValue

  const test = await invokeTestOpenAiModelEdge(key, validated)
  if (!test.ok) {
    return { error: test.message }
  }

  const { error: upsertError } = await supabase.from('admin_openai_model_config').upsert(
    {
      config_key: key,
      model_value: validated,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: 'config_key' }
  )

  if (upsertError) {
    return { error: upsertError.message }
  }

  const sync = await syncOpenAiSecretsToEdge({ [key]: validated })
  if (!sync.ok && process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    await restorePreviousModelConfig(supabase, key, previousConfiguredValue, actorId)
    return {
      error: `${sync.message} Change was rolled back to the previous value.`,
    }
  }

  const updatedCatalog = await fetchResolvedOpenAiModels(supabase)
  const entry = updatedCatalog.find((item) => item.key === key)

  if (!entry) {
    return { error: 'Applied but failed to reload config' }
  }

  return { entry, test, sync }
}
