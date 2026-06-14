import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { StoryStepLatestRow } from '@/lib/admin/story-step-runs'

export function extractModelNamesFromMeta(
  meta: Record<string, unknown> | null | undefined
): string[] {
  if (!meta) return []

  const names = new Set<string>()

  const add = (value: unknown) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed) names.add(trimmed)
  }

  add(meta.model_name)
  add(meta.model)

  for (const key of ['model_names', 'models'] as const) {
    const value = meta[key]
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
    } else if (value && typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) add(entry)
    }
  }

  return [...names]
}

export function formatRunModelLabel(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} · ${names[1]}`
  return `${names[0]} · ${names[1]} +${names.length - 2}`
}

export function mergeRunModelLabels(...groups: Array<string[] | null | undefined>): string | null {
  const names = new Set<string>()
  for (const group of groups) {
    for (const name of group ?? []) {
      if (name.trim()) names.add(name.trim())
    }
  }
  return formatRunModelLabel([...names])
}

const STORY_MODEL_BY_STEP: Partial<
  Record<PipelineStepId, (story: { relevance_model?: string | null }) => string | null>
> = {
  'relevance-gate': (story) => story.relevance_model?.trim() || null,
  'review-pending-stories': (story) => story.relevance_model?.trim() || null,
}

export function resolveStoryStepRunModelLabel(
  stepId: PipelineStepId,
  run: StoryStepLatestRow | null | undefined,
  story?: { relevance_model?: string | null } | null
): string | null {
  const fromMeta = formatRunModelLabel(extractModelNamesFromMeta(run?.meta))
  const fromStory = story ? STORY_MODEL_BY_STEP[stepId]?.(story) ?? null : null
  return mergeRunModelLabels(fromMeta ? [fromMeta] : [], fromStory ? [fromStory] : [])
}

export function formatAgentRunSubtitle(input: {
  modelLabel: string | null
  noModelLabel?: string
}): string {
  if (input.modelLabel) return input.modelLabel
  return input.noModelLabel ?? 'no LLM used'
}
