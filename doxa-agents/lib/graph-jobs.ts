// Shared enqueue rules for Neo4j graph_processing_jobs (Phase 0+).
// See doxa-agents/docs/architecture/neo4j-graph-architecture.md
// Keep in sync with services/graph-worker/app/config.py

export const GRAPH_SCHEMA_VERSION = "2.1.0";
export const GRAPH_EXTRACTOR_VERSION = "2.1.2-utterance-proposition";

/** Default stale threshold for force_stale (matches SQL enqueue_graph_processing_job). */
export const STALE_RUNNING_MINUTES = 360;

// Minimal surface of supabase-js used by enqueue (Deno Edge + shared lib).
// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

export type EnqueueGraphJobResult =
  | { ok: true; skipped: true; reason: "running" }
  | { ok: true; skipped: false; job_id?: string }
  | { ok: false; error: string };

export type EnqueueGraphJobOptions = {
  /** When true, mark running jobs older than STALE_RUNNING_MINUTES as failed, then enqueue. */
  force_stale?: boolean;
};

/**
 * Atomically enqueue via public.enqueue_graph_processing_job (service_role).
 */
export async function enqueueGraphJob(
  supabase: SupabaseClientLike,
  storyId: string,
  options: EnqueueGraphJobOptions = {}
): Promise<EnqueueGraphJobResult> {
  const { data, error } = await supabase.rpc("enqueue_graph_processing_job", {
    p_story_id: storyId,
    p_schema_version: GRAPH_SCHEMA_VERSION,
    p_extractor_version: GRAPH_EXTRACTOR_VERSION,
    p_force_stale: Boolean(options.force_stale),
    p_stale_after_minutes: STALE_RUNNING_MINUTES,
  });

  if (error) return { ok: false, error: error.message };

  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!payload || payload.ok !== true) {
    return { ok: false, error: "Unexpected enqueue_graph_processing_job response" };
  }
  if (payload.skipped === true) {
    return { ok: true, skipped: true, reason: "running" };
  }
  return {
    ok: true,
    skipped: false,
    job_id: typeof payload.job_id === "string" ? payload.job_id : undefined,
  };
}
