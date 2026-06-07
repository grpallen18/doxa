import type { SupabaseClient } from '@supabase/supabase-js'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

export type StoryAuditEvent = {
  id: string
  at: string
  label: string
  detail?: string
  meta?: string
}

export function buildStoryAuditFromPayload(
  payload: StoryExtractionReviewPayload
): StoryAuditEvent[] {
  const events: StoryAuditEvent[] = []
  const { story } = payload

  const push = (id: string, at: string | null, label: string, detail?: string, meta?: string) => {
    if (!at) return
    events.push({ id, at, label, detail, meta })
  }

  push('created', story.created_at, 'Story ingested', story.title)
  push('fetched', story.fetched_at, 'Story fetched')
  push('relevance', story.relevance_ran_at, 'Qualification ran', story.relevance_status ?? undefined)
  push(
    'pending-review',
    story.pending_review_ran_at,
    'Pending qualification review ran'
  )
  push('scraped', story.scraped_at, 'Content scraped', story.scrape_skipped ? 'Skipped' : undefined)
  push(
    'extraction',
    story.extraction_completed_at,
    'Extraction completed',
    story.extraction_status
  )
  push('merged', story.merged_at, 'Story merge completed')
  push(
    'qa-validated',
    story.extraction_qa_validated_at,
    'Merge QA validated',
    story.extraction_qa_status ?? undefined
  )

  for (const fb of payload.feedback) {
    events.push({
      id: `feedback-${fb.id}`,
      at: fb.created_at,
      label: `Feedback: ${fb.rating}`,
      detail: fb.notes ?? undefined,
      meta: [fb.entity_type, fb.pipeline_stage, fb.chunk_index != null ? `chunk ${fb.chunk_index}` : null]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const art of payload.qa_artifacts) {
    events.push({
      id: `qa-artifact-${art.id}`,
      at: art.created_at ?? story.created_at,
      label: `QA artifact: ${art.stage}`,
      meta: art.chunk_index != null ? `chunk ${art.chunk_index}` : undefined,
    })
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return events
}

export async function fetchStoryPipelineRunEvents(
  supabase: SupabaseClient,
  storyId: string
): Promise<StoryAuditEvent[]> {
  const runIds = new Set<string>()

  const [claimsRes, eventsRes, evidenceRes] = await Promise.all([
    supabase.from('story_claims').select('run_id').eq('story_id', storyId).not('run_id', 'is', null),
    supabase.from('story_events').select('run_id').eq('story_id', storyId).not('run_id', 'is', null),
    supabase
      .from('story_evidence')
      .select('run_id')
      .eq('story_id', storyId)
      .not('run_id', 'is', null),
  ])

  for (const row of [...(claimsRes.data ?? []), ...(eventsRes.data ?? []), ...(evidenceRes.data ?? [])]) {
    if (row.run_id) runIds.add(row.run_id as string)
  }

  if (runIds.size === 0) return []

  const { data: runs } = await supabase
    .from('pipeline_runs')
    .select('run_id, pipeline_name, status, started_at, ended_at, model_name, error')
    .in('run_id', [...runIds])
    .order('started_at', { ascending: false })
    .limit(50)

  return (runs ?? []).map((run) => ({
    id: `run-${run.run_id}`,
    at: (run.started_at as string) ?? new Date().toISOString(),
    label: `Pipeline run: ${run.pipeline_name}`,
    detail: run.status as string,
    meta: [run.model_name, run.error].filter(Boolean).join(' · ') || undefined,
  }))
}

export async function buildStoryAuditEvents(
  supabase: SupabaseClient,
  storyId: string,
  payload: StoryExtractionReviewPayload
): Promise<StoryAuditEvent[]> {
  const fromPayload = buildStoryAuditFromPayload(payload)
  const fromRuns = await fetchStoryPipelineRunEvents(supabase, storyId)
  const merged = [...fromPayload, ...fromRuns]
  merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return merged.slice(0, 80)
}
