import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import {
  extractModelNamesFromMeta,
  mergeRunModelLabels,
} from '@/lib/admin/run-models'
import {
  PIPELINE_STEPS,
  type PipelineStepId,
  type PromptKind,
} from '@/lib/admin/generated/pipeline-catalog'

type ManifestStep = {
  id: string
  deploy_name?: string
  department: string
  workflow: string
  status: string
  source?: string
  cron?: { job_name: string; schedule: string }
  secrets?: string[]
}

type Manifest = { steps: ManifestStep[] }

let manifestCache: Manifest | null = null

function loadManifest(): Manifest {
  if (manifestCache) return manifestCache
  const manifestPath = path.join(process.cwd(), 'doxa-agents', 'manifest.yaml')
  const raw = fs.readFileSync(manifestPath, 'utf8')
  manifestCache = yaml.parse(raw) as Manifest
  return manifestCache
}

export type AgentDetail = {
  stepId: PipelineStepId
  label: string
  stageId: string
  stageLabel: string
  deployName: string
  scope: string
  optional: boolean
  manifestStatus: string
  inactiveNote: string | null
  isolationParams: string[]
  invokeOptions: {
    usesMaxChunks: boolean
    maxChunks: number | null
    timeoutMs: number
  }
  department: string | null
  workflow: string | null
  sourcePath: string | null
  cron: { job_name: string; schedule: string } | null
  secrets: string[]
  promptKind: PromptKind
  userPayloadDoc: string | null
}

export type AgentRunSummary = {
  run_id: string
  pipeline_name: string
  status: string
  started_at: string
  ended_at: string | null
  model_name: string | null
  model_names: string[]
  error: string | null
  story_id: string | null
}

export function getAgentDetail(stepId: string): AgentDetail | null {
  const catalog = PIPELINE_STEPS.find((s) => s.id === stepId)
  if (!catalog) return null

  const manifest = loadManifest()
  const manifestStep = manifest.steps.find((s) => s.id === stepId)

  return {
    stepId: catalog.id,
    label: catalog.label,
    stageId: catalog.stageId,
    stageLabel: catalog.stageLabel,
    deployName: catalog.deployName,
    scope: catalog.scope,
    optional: catalog.optional,
    manifestStatus: catalog.manifestStatus,
    inactiveNote: catalog.inactiveNote,
    isolationParams: catalog.isolationParams,
    invokeOptions: catalog.invokeOptions,
    department: manifestStep?.department ?? null,
    workflow: manifestStep?.workflow ?? null,
    sourcePath: manifestStep?.source ?? null,
    cron: manifestStep?.cron ?? null,
    secrets: manifestStep?.secrets ?? [],
    promptKind: catalog.promptKind,
    userPayloadDoc: catalog.userPayloadDoc,
  }
}

export type AgentRunStats = {
  totalSampled: number
  successCount: number
  failureCount: number
  successRate: number | null
  lastSuccessAt: string | null
  averageRuntimeMs: number | null
  recentErrors: Array<{ started_at: string; error: string }>
}

function isSuccessStatus(status: string): boolean {
  const normalized = status.toLowerCase()
  return (
    normalized === 'completed' ||
    normalized === 'success' ||
    normalized === 'no_op'
  )
}

function isFailureStatus(status: string): boolean {
  const normalized = status.toLowerCase()
  return normalized === 'failed' || normalized === 'failure' || normalized === 'error'
}

export function computeAgentRunStats(runs: AgentRunSummary[]): AgentRunStats {
  if (runs.length === 0) {
    return {
      totalSampled: 0,
      successCount: 0,
      failureCount: 0,
      successRate: null,
      lastSuccessAt: null,
      averageRuntimeMs: null,
      recentErrors: [],
    }
  }

  let successCount = 0
  let failureCount = 0
  let lastSuccessAt: string | null = null
  let runtimeTotal = 0
  let runtimeCount = 0
  const recentErrors: AgentRunStats['recentErrors'] = []

  for (const run of runs) {
    if (isSuccessStatus(run.status)) {
      successCount += 1
      if (!lastSuccessAt || run.started_at > lastSuccessAt) {
        lastSuccessAt = run.started_at
      }
    } else if (isFailureStatus(run.status)) {
      failureCount += 1
      if (run.error && recentErrors.length < 5) {
        recentErrors.push({ started_at: run.started_at, error: run.error })
      }
    }

    if (run.started_at && run.ended_at) {
      const ms =
        new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()
      if (Number.isFinite(ms) && ms >= 0) {
        runtimeTotal += ms
        runtimeCount += 1
      }
    }
  }

  const totalSampled = runs.length
  const successRate = totalSampled > 0 ? successCount / totalSampled : null

  return {
    totalSampled,
    successCount,
    failureCount,
    successRate,
    lastSuccessAt,
    averageRuntimeMs: runtimeCount > 0 ? Math.round(runtimeTotal / runtimeCount) : null,
    recentErrors,
  }
}

export type AgentRunsPageResult = {
  runs: AgentRunSummary[]
  total: number
}

function catalogStepForDeployName(deployName: string) {
  return PIPELINE_STEPS.find((step) => step.deployName === deployName) ?? null
}

function mapStepOutcomeToStatus(outcome: string): string {
  switch (outcome) {
    case 'success':
      return 'success'
    case 'failure':
      return 'failed'
    case 'looping':
      return 'running'
    case 'skipped':
      return 'skipped'
    case 'no_op':
      return 'no_op'
    default:
      return outcome
  }
}

const TERMINAL_STEP_OUTCOMES = new Set(['success', 'failure', 'skipped', 'no_op'])

/** Post-worker scrape dispatch logged looping after the callback success row. */
function isStaleDispatchTailLoopingRow(row: Record<string, unknown>): boolean {
  if (row.outcome !== 'looping') return false
  const meta = (row.meta as Record<string, unknown> | null) ?? {}
  if (meta.phase === 'dispatch') return false
  return (
    meta.dispatched === 1 ||
    meta.worker_status != null ||
    meta.worker_timeout === true
  )
}

function filterMisorderedStepRunRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const terminalsByStory = new Map<string, number[]>()
  for (const row of rows) {
    if (!TERMINAL_STEP_OUTCOMES.has(row.outcome as string)) continue
    const storyId = row.story_id as string
    const at = new Date(row.occurred_at as string).getTime()
    const list = terminalsByStory.get(storyId) ?? []
    list.push(at)
    terminalsByStory.set(storyId, list)
  }

  return rows.filter((row) => {
    if (!isStaleDispatchTailLoopingRow(row)) return true
    const storyId = row.story_id as string
    const terminals = terminalsByStory.get(storyId)
    if (!terminals?.length) return true
    const loopingAt = new Date(row.occurred_at as string).getTime()
    return !terminals.some((terminalAt) => terminalAt < loopingAt)
  })
}

function mapStoryStepRunRow(
  row: Record<string, unknown>,
  modelExtras?: {
    pipelineRunModels?: Map<string, string | null>
    storyRelevanceModels?: Map<string, string | null>
  }
): AgentRunSummary {
  const meta = (row.meta as Record<string, unknown> | null) ?? {}
  const modelNames = extractModelNamesFromMeta(meta)
  const pipelineRunId = (row.pipeline_run_id as string | null) ?? null
  const storyId = (row.story_id as string | null) ?? null
  const stepId = row.step_id as PipelineStepId | undefined

  const pipelineModel =
    pipelineRunId && modelExtras?.pipelineRunModels
      ? modelExtras.pipelineRunModels.get(pipelineRunId) ?? null
      : null
  const storyModel =
    storyId &&
    modelExtras?.storyRelevanceModels &&
    (stepId === 'relevance-gate' || stepId === 'review-pending-stories')
      ? modelExtras.storyRelevanceModels.get(storyId) ?? null
      : null

  const mergedNames = mergeRunModelLabels(
    modelNames,
    pipelineModel ? [pipelineModel] : [],
    storyModel ? [storyModel] : []
  )

  return {
    run_id: row.id as string,
    pipeline_name: row.deploy_name as string,
    status: mapStepOutcomeToStatus(row.outcome as string),
    started_at: row.occurred_at as string,
    ended_at: (row.ended_at as string | null) ?? null,
    model_name: mergedNames,
    model_names: [
      ...new Set([
        ...modelNames,
        ...(pipelineModel ? [pipelineModel] : []),
        ...(storyModel ? [storyModel] : []),
      ]),
    ],
    error: (row.error as string | null) ?? null,
    story_id: storyId,
  }
}

async function loadRunModelExtras(
  supabase: SupabaseClient,
  stepId: PipelineStepId,
  rows: Record<string, unknown>[]
): Promise<{
  pipelineRunModels: Map<string, string | null>
  storyRelevanceModels: Map<string, string | null>
}> {
  const pipelineRunModels = new Map<string, string | null>()
  const storyRelevanceModels = new Map<string, string | null>()

  const pipelineRunIds = [
    ...new Set(
      rows
        .map((row) => row.pipeline_run_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ]

  if (pipelineRunIds.length > 0) {
    const { data } = await supabase
      .from('pipeline_runs')
      .select('run_id, model_name')
      .in('run_id', pipelineRunIds)

    for (const row of data ?? []) {
      pipelineRunModels.set(
        row.run_id as string,
        (row.model_name as string | null) ?? null
      )
    }
  }

  if (stepId === 'relevance-gate' || stepId === 'review-pending-stories') {
    const storyIds = [
      ...new Set(
        rows
          .map((row) => row.story_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ]

    if (storyIds.length > 0) {
      const { data } = await supabase
        .from('stories')
        .select('story_id, relevance_model')
        .in('story_id', storyIds)

      for (const row of data ?? []) {
        storyRelevanceModels.set(
          row.story_id as string,
          (row.relevance_model as string | null) ?? null
        )
      }
    }
  }

  return { pipelineRunModels, storyRelevanceModels }
}

async function fetchAgentRecentRunsFromStorySteps(
  supabase: SupabaseClient,
  stepId: PipelineStepId,
  pagination: { limit: number; offset: number }
): Promise<AgentRunsPageResult> {
  const { data, error, count } = await supabase
    .from('story_step_runs')
    .select(
      'id, story_id, step_id, deploy_name, outcome, occurred_at, ended_at, error, meta, pipeline_run_id',
      { count: 'exact' }
    )
    .eq('step_id', stepId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1)

  if (error) throw error

  const rawRows = filterMisorderedStepRunRows((data ?? []) as Record<string, unknown>[])
  const modelExtras = await loadRunModelExtras(supabase, stepId, rawRows)

  return {
    runs: rawRows.map((row) => mapStoryStepRunRow(row, modelExtras)),
    total: count ?? 0,
  }
}

async function fetchAgentRecentRunsFromPipelineRuns(
  supabase: SupabaseClient,
  deployName: string,
  pagination: { limit: number; offset: number }
): Promise<AgentRunsPageResult> {
  const { data: runs, count } = await supabase
    .from('pipeline_runs')
    .select('run_id, pipeline_name, status, started_at, ended_at, model_name, error', {
      count: 'exact',
    })
    .eq('pipeline_name', deployName)
    .order('started_at', { ascending: false })
    .order('run_id', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1)

  if (!runs?.length) return { runs: [], total: count ?? 0 }

  const runIds = runs.map((r) => r.run_id as string)

  const { data: claimLinks } = await supabase
    .from('story_claims')
    .select('run_id, story_id')
    .in('run_id', runIds)

  const storyByRun = new Map<string, string>()
  for (const row of claimLinks ?? []) {
    if (row.run_id && row.story_id && !storyByRun.has(row.run_id as string)) {
      storyByRun.set(row.run_id as string, row.story_id as string)
    }
  }

  return {
    runs: runs.map((run) => ({
      run_id: run.run_id as string,
      pipeline_name: run.pipeline_name as string,
      status: run.status as string,
      started_at: run.started_at as string,
      ended_at: (run.ended_at as string | null) ?? null,
      model_name: (run.model_name as string | null) ?? null,
      model_names: (run.model_name as string | null) ? [run.model_name as string] : [],
      error: (run.error as string | null) ?? null,
      story_id: storyByRun.get(run.run_id as string) ?? null,
    })),
    total: count ?? runs.length,
  }
}

export async function fetchAgentRecentRuns(
  supabase: SupabaseClient,
  deployName: string,
  pagination: { limit: number; offset: number }
): Promise<AgentRunsPageResult> {
  const catalogStep = catalogStepForDeployName(deployName)

  if (catalogStep) {
    const stepRuns = await fetchAgentRecentRunsFromStorySteps(
      supabase,
      catalogStep.id,
      pagination
    )
    if (stepRuns.total > 0 || pagination.offset > 0) {
      return stepRuns
    }
  }

  return fetchAgentRecentRunsFromPipelineRuns(supabase, deployName, pagination)
}
