import fs from 'fs'
import path from 'path'
import yaml from 'yaml'

export type OpenAiModelKind = 'chat' | 'embedding'

export type OpenAiModelKeyMeta = {
  key: string
  kind: OpenAiModelKind
  label: string
  description: string
  codeDefault: string
  usedByStepIds: string[]
}

type ManifestStep = {
  id: string
  secrets?: string[]
}

type Manifest = {
  steps: ManifestStep[]
}

const KEY_META: Record<
  string,
  Omit<OpenAiModelKeyMeta, 'key' | 'usedByStepIds'>
> = {
  OPENAI_MODEL: {
    kind: 'chat',
    label: 'Default chat model',
    description: 'Primary chat/completions model for most pipeline agents.',
    codeDefault: 'gpt-4o-mini',
  },
  OPENAI_MODEL_LARGE: {
    kind: 'chat',
    label: 'Large chat model',
    description: 'Used for long-content cleaning when raw HTML exceeds the size threshold.',
    codeDefault: 'gpt-5.2-2025-12-11',
  },
  OPENAI_MODEL_EXTRACT: {
    kind: 'chat',
    label: 'Extract model',
    description: 'Chunk extraction lane; does not fall back to OPENAI_MODEL.',
    codeDefault: 'gpt-4o-mini',
  },
  OPENAI_MODEL_CHUNK_QA: {
    kind: 'chat',
    label: 'Chunk QA model',
    description: 'Validate/refine/standardize chunk extraction and claims/positions QA.',
    codeDefault: 'gpt-5.4-nano-2026-03-17',
  },
  OPENAI_EMBEDDING_MODEL: {
    kind: 'embedding',
    label: 'Embedding model',
    description: 'Embeddings for canonical linking, topology, and topic processing.',
    codeDefault: 'text-embedding-3-small',
  },
}

const MODEL_KEY_PATTERN = /^[a-zA-Z0-9._-]+$/

function loadManifestSteps(): ManifestStep[] {
  const manifestPath = path.join(process.cwd(), 'doxa-agents', 'manifest.yaml')
  const raw = fs.readFileSync(manifestPath, 'utf8')
  const manifest = yaml.parse(raw) as Manifest
  return manifest.steps ?? []
}

export function listOpenAiModelKeysFromManifest(): string[] {
  const keys = new Set<string>()
  for (const step of loadManifestSteps()) {
    for (const secret of step.secrets ?? []) {
      if (secret.startsWith('OPENAI_') && secret !== 'OPENAI_API_KEY') {
        keys.add(secret)
      }
    }
  }
  return [...keys].sort()
}

export function buildOpenAiModelCatalog(): OpenAiModelKeyMeta[] {
  const steps = loadManifestSteps()
  const keys = listOpenAiModelKeysFromManifest()

  return keys.map((key) => {
    const meta = KEY_META[key] ?? {
      kind: key.includes('EMBEDDING') ? ('embedding' as const) : ('chat' as const),
      label: key.replace(/^OPENAI_/, '').replace(/_/g, ' ').toLowerCase(),
      description: 'OpenAI model secret referenced by pipeline handlers.',
      codeDefault: key.includes('EMBEDDING') ? 'text-embedding-3-small' : 'gpt-4o-mini',
    }

    const usedByStepIds = steps
      .filter((step) => step.secrets?.includes(key))
      .map((step) => step.id)
      .sort()

    return { key, ...meta, usedByStepIds }
  })
}

export function isEditableOpenAiModelKey(key: string): boolean {
  return listOpenAiModelKeysFromManifest().includes(key)
}

export function validateModelValue(value: string): string | { error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { error: 'Model ID is required' }
  if (trimmed.length > 120) return { error: 'Model ID must be 120 characters or fewer' }
  if (!MODEL_KEY_PATTERN.test(trimmed)) {
    return { error: 'Model ID may only contain letters, numbers, dots, underscores, and hyphens' }
  }
  return trimmed
}

export function getOpenAiModelKind(key: string): OpenAiModelKind {
  const entry = buildOpenAiModelCatalog().find((item) => item.key === key)
  return entry?.kind ?? (key.includes('EMBEDDING') ? 'embedding' : 'chat')
}
