import { createAdminClient, formatSupabaseAdminError } from '@/lib/supabase/server'
import {
  isGraphProcessingStatus,
  type GraphJobStatusPayload,
} from '@/lib/graph/versions'

export async function loadGraphJobStatus(
  storyId: string
): Promise<GraphJobStatusPayload | null> {
  const supabase = createAdminClient()
  const { data: story, error: storyErr } = await supabase
    .from('stories')
    .select('story_id, graph_status')
    .eq('story_id', storyId)
    .maybeSingle()

  if (storyErr) {
    throw new Error(formatSupabaseAdminError(storyErr.message))
  }
  if (!story) return null

  const { data: jobs, error: jobErr } = await supabase
    .from('graph_processing_jobs')
    .select(
      'id, status, error, finished_at, created_at, schema_version, extractor_version'
    )
    .eq('story_id', storyId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (jobErr) {
    throw new Error(formatSupabaseAdminError(jobErr.message))
  }

  const job = jobs?.[0] ?? null
  const graphStatus = (story.graph_status as string | null) ?? null
  const jobStatus = (job?.status as string | null) ?? null

  return {
    story_id: story.story_id as string,
    graph_status: graphStatus,
    job_id: (job?.id as string | null) ?? null,
    job_status: jobStatus,
    job_error: (job?.error as string | null) ?? null,
    job_finished_at: (job?.finished_at as string | null) ?? null,
    job_created_at: (job?.created_at as string | null) ?? null,
    schema_version: (job?.schema_version as string | null) ?? null,
    extractor_version: (job?.extractor_version as string | null) ?? null,
    is_processing:
      isGraphProcessingStatus(graphStatus) || isGraphProcessingStatus(jobStatus),
  }
}
