/**
 * Graph job version strings for admin enqueue (Next.js).
 * Keep in sync with doxa-agents/lib/graph-jobs.ts and
 * services/graph-worker/app/config.py
 */
export const GRAPH_SCHEMA_VERSION = '2.2.0'
export const GRAPH_EXTRACTOR_VERSION = '2.2.0-argument-debate'

/** Admin reprocess: clear stale running locks after 1 minute. */
export const ADMIN_STALE_RUNNING_MINUTES = 1

export type GraphJobStatusPayload = {
  story_id: string
  graph_status: string | null
  job_id: string | null
  job_status: string | null
  job_error: string | null
  job_finished_at: string | null
  job_created_at: string | null
  schema_version: string | null
  extractor_version: string | null
  is_processing: boolean
}

export function isGraphProcessingStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'running'
}
