import {
  extractOutputJsonBlock,
  extractRecommendedActions,
  parseOutputExampleObject,
  sanitizePromptJsonExample,
} from '@/lib/admin/prompt-output-parse'

export type BuildSchemaResult =
  | { ok: true; schema: Record<string, unknown>; schemaName: string }
  | { ok: false; error: string }

function pipeEnumValues(value: string): string[] | null {
  if (!value.includes('|')) return null
  return value
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function schemaFromExample(value: unknown, fieldKey?: string): Record<string, unknown> {
  if (value === null) {
    return { type: ['string', 'null'] }
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' }
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  }

  if (typeof value === 'string') {
    const enums = pipeEnumValues(value)
    if (enums && enums.length > 0) {
      return { type: 'string', enum: enums }
    }
    if (fieldKey === 'recommended_raw_text' || value.toLowerCase() === 'null') {
      return { type: ['string', 'null'] }
    }
    return { type: 'string' }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: { type: 'string' } }
    }
    const item = value[0]
    if (typeof item === 'string') {
      return { type: 'array', items: { type: 'string' } }
    }
    if (typeof item === 'number') {
      return { type: 'array', items: { type: 'integer' } }
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return { type: 'array', items: objectSchemaFromExample(item as Record<string, unknown>) }
    }
    return { type: 'array', items: { type: 'string' } }
  }

  if (value && typeof value === 'object') {
    return objectSchemaFromExample(value as Record<string, unknown>)
  }

  return { type: 'string' }
}

function objectSchemaFromExample(example: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, val] of Object.entries(example)) {
    properties[key] = schemaFromExample(val, key)
    required.push(key)
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

/** OpenAI structured-output schema names (distinct from catalog step / deploy ids). */
const OPENAI_SCHEMA_NAMES: Record<string, string> = {
  'validate-chunk-claims': 'doxa_chunk_claims_review',
  'refine-chunk-claims': 'doxa_chunk_claims_refine',
  'approve-chunk-claims': 'doxa_chunk_claims_approve',
  'validate-chunk-positions': 'doxa_chunk_positions_review',
  'refine-chunk-positions': 'doxa_chunk_positions_refine',
}

export function openAiSchemaNameForStep(stepId: string): string {
  return OPENAI_SCHEMA_NAMES[stepId] ?? stepId.replace(/-/g, '_')
}

export function buildOpenAiSchemaFromPrompt(
  stepId: string,
  systemPrompt: string
): BuildSchemaResult {
  const block = extractOutputJsonBlock(systemPrompt)
  if (!block) {
    return { ok: false, error: 'Prompt has no OUTPUT JSON example to derive a schema from.' }
  }

  const example = parseOutputExampleObject(systemPrompt)
  if (!example) {
    return {
      ok: false,
      error:
        'Could not parse the OUTPUT JSON example. Use valid JSON with pipe enums like "a | b".',
    }
  }

  const schema = objectSchemaFromExample(example)

  const actions = extractRecommendedActions(block)
  if (actions.length > 0) {
    const props = schema.properties as Record<string, unknown>
    props.recommended_action = { type: 'string', enum: actions }
  }

  const schemaName = openAiSchemaNameForStep(stepId)

  return { ok: true, schema, schemaName }
}

export function specFromOpenAiSchema(schema: Record<string, unknown>): {
  topLevel: string[]
  nested: Record<string, string[]>
  recommendedActions?: string[]
} {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
  const topLevel = Array.isArray(schema.required)
    ? (schema.required as string[])
    : Object.keys(properties)

  const nested: Record<string, string[]> = {}
  for (const [key, field] of Object.entries(properties)) {
    if (field.type !== 'array') continue
    const items = field.items as Record<string, unknown> | undefined
    if (!items?.properties) continue
    nested[key] = Array.isArray(items.required)
      ? (items.required as string[])
      : Object.keys(items.properties as Record<string, unknown>)
  }

  const actionField = properties.recommended_action
  const recommendedActions = Array.isArray(actionField?.enum)
    ? (actionField.enum as string[])
    : undefined

  return { topLevel, nested, recommendedActions }
}
