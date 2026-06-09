import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import type { SupabaseClient } from '@supabase/supabase-js'
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

export type AgentRunsPageResult = {
  runs: AgentRunSummary[]
  total: number
}

export async function fetchAgentRecentRuns(
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
      error: (run.error as string | null) ?? null,
      story_id: storyByRun.get(run.run_id as string) ?? null,
    })),
    total: count ?? runs.length,
  }
}
