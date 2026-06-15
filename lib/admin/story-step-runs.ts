import type { SupabaseClient } from '@supabase/supabase-js'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import { PIPELINE_STAGES } from '@/lib/admin/generated/pipeline-catalog'

export type StoryStepOutcome = 'success' | 'failure' | 'looping' | 'skipped' | 'no_op'
export type StoryStepTrigger = 'cron' | 'admin' | 'callback' | 'internal'

export type StoryStepLatestRow = {
  id: string
  story_id: string
  step_id: string
  deploy_name: string
  outcome: StoryStepOutcome
  occurred_at: string
  ended_at: string | null
  trigger: StoryStepTrigger
  pipeline_run_id: string | null
  chunk_index: number | null
  actor_id: string | null
  meta: Record<string, unknown>
  error: string | null
}

export type StoryStepRunHistoryRow = StoryStepLatestRow

export const STORY_STEP_OUTCOME_LABELS: Record<StoryStepOutcome, string> = {
  success: 'Complete',
  failure: 'Failed',
  looping: 'In progress',
  skipped: 'Skipped',
  no_op: 'No work',
}

export const PIPELINE_CATALOG_STEP_IDS: PipelineStepId[] = PIPELINE_STAGES.flatMap(
  (stage) => stage.stepIds
)

export async function fetchStoryStepLatestByStep(
  supabase: SupabaseClient,
  storyId: string
): Promise<Record<PipelineStepId, StoryStepLatestRow | null>> {
  const { data, error } = await supabase
    .from('story_step_latest')
    .select(
      'id, story_id, step_id, deploy_name, outcome, occurred_at, ended_at, trigger, pipeline_run_id, chunk_index, actor_id, meta, error'
    )
    .eq('story_id', storyId)

  const byStep = Object.fromEntries(
    PIPELINE_CATALOG_STEP_IDS.map((stepId) => [stepId, null])
  ) as Record<PipelineStepId, StoryStepLatestRow | null>

  if (error) {
    console.error('[story-step-runs] fetch latest failed:', error.message)
    return byStep
  }

  for (const row of data ?? []) {
    const stepId = row.step_id as PipelineStepId
    if (!PIPELINE_CATALOG_STEP_IDS.includes(stepId)) continue
    byStep[stepId] = {
      id: row.id as string,
      story_id: row.story_id as string,
      step_id: stepId,
      deploy_name: row.deploy_name as string,
      outcome: row.outcome as StoryStepOutcome,
      occurred_at: row.occurred_at as string,
      ended_at: (row.ended_at as string | null) ?? null,
      trigger: row.trigger as StoryStepTrigger,
      pipeline_run_id: (row.pipeline_run_id as string | null) ?? null,
      chunk_index: row.chunk_index != null ? Number(row.chunk_index) : null,
      actor_id: (row.actor_id as string | null) ?? null,
      meta: (row.meta as Record<string, unknown>) ?? {},
      error: (row.error as string | null) ?? null,
    }
  }

  return byStep
}

function mapStoryStepRunRow(row: Record<string, unknown>, stepId: PipelineStepId): StoryStepRunHistoryRow {
  return {
    id: row.id as string,
    story_id: row.story_id as string,
    step_id: stepId,
    deploy_name: row.deploy_name as string,
    outcome: row.outcome as StoryStepOutcome,
    occurred_at: row.occurred_at as string,
    ended_at: (row.ended_at as string | null) ?? null,
    trigger: row.trigger as StoryStepTrigger,
    pipeline_run_id: (row.pipeline_run_id as string | null) ?? null,
    chunk_index: row.chunk_index != null ? Number(row.chunk_index) : null,
    actor_id: (row.actor_id as string | null) ?? null,
    meta: (row.meta as Record<string, unknown>) ?? {},
    error: (row.error as string | null) ?? null,
  }
}

export async function fetchStoryStepRunHistory(
  supabase: SupabaseClient,
  storyId: string,
  limitPerStep = 5
): Promise<Partial<Record<PipelineStepId, StoryStepRunHistoryRow[]>>> {
  const results = await Promise.all(
    PIPELINE_CATALOG_STEP_IDS.map(async (stepId) => {
      const { data, error } = await supabase
        .from('story_step_runs')
        .select(
          'id, story_id, step_id, deploy_name, outcome, occurred_at, ended_at, trigger, pipeline_run_id, chunk_index, actor_id, meta, error'
        )
        .eq('story_id', storyId)
        .eq('step_id', stepId)
        .order('occurred_at', { ascending: false })
        .limit(limitPerStep)

      if (error) {
        console.error(`[story-step-runs] fetch history failed step=${stepId}:`, error.message)
        return [stepId, [] as StoryStepRunHistoryRow[]] as const
      }

      const rows = (data ?? []).map((row) =>
        mapStoryStepRunRow(row as Record<string, unknown>, stepId)
      )
      return [stepId, rows] as const
    })
  )

  const grouped: Partial<Record<PipelineStepId, StoryStepRunHistoryRow[]>> = {}
  for (const [stepId, rows] of results) {
    if (rows.length > 0) grouped[stepId] = rows
  }
  return grouped
}

export async function appendAdminStoryStepRunFailure(
  supabase: SupabaseClient,
  input: {
    storyId: string
    stepId: string
    deployName: string
    actorId: string
    error: string
    chunkIndex?: number | null
    meta?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.rpc('append_story_step_run', {
    p_story_id: input.storyId,
    p_step_id: input.stepId,
    p_deploy_name: input.deployName,
    p_outcome: 'failure',
    p_trigger: 'admin',
    p_pipeline_run_id: null,
    p_chunk_index: input.chunkIndex ?? null,
    p_actor_id: input.actorId,
    p_meta: input.meta ?? {},
    p_error: input.error,
    p_ended_at: null,
  })

  if (error) {
    console.error('[story-step-runs] append admin failure failed:', error.message)
  }
}
