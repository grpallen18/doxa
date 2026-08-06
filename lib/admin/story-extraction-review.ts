import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import type { ChunkLanePhase } from '@/lib/admin/pipeline-status/chunk-phase'
import { resolveStoryUuid } from '@/lib/admin/resolve-story-id'
import {
  fetchStoryStepLatestByStep,
  fetchStoryStepRunHistory,
  type StoryStepLatestRow,
  type StoryStepRunHistoryRow,
} from '@/lib/admin/story-step-runs'

export type { ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'

export type ExtractionStatus =
  | 'merged'
  | 'extracted'
  | 'skipped_empty'
  | 'pending_extraction'
  | 'unknown'

export type StoryListItem = {
  story_id: string
  friendly_id: string
  title: string
  url: string
  source_name: string | null
  published_at: string | null
  fetched_at: string
  created_at: string
  relevance_status: string | null
  relevance_score: number | null
  extraction_status: ExtractionStatus
  extraction_qa_status: ExtractionQaStatus
  claim_count: number
  evidence_count: number
  position_count: number
  event_count: number
}

export type StoryExtractionReviewPayload = {
  story: {
    story_id: string
    friendly_id: string
    title: string
    url: string
    author: string | null
    published_at: string | null
    fetched_at: string
    created_at: string
    content_snippet: string | null
    content_full: string | null
    relevance_status: string | null
    relevance_score: number | null
    relevance_ran_at: string | null
    relevance_model: string | null
    relevance_tags: string[] | null
    pending_review_ran_at: string | null
    scraped_at: string | null
    scrape_dispatched_at: string | null
    scrape_skipped: boolean
    scrape_fail_count: number
    has_content_clean: boolean
    cleaned_at: string | null
    content_length_clean: number | null
    extraction_completed_at: string | null
    extraction_skipped_empty: boolean
    merged_at: string | null
    extraction_status: ExtractionStatus
    extraction_qa_status: ExtractionQaStatus
    extraction_qa_review_report: unknown
    extraction_qa_validation_report: unknown
    extraction_qa_refinement_count: number
    extraction_qa_validated_at: string | null
    source_name: string | null
    article_text: string | null
  }
  claims: Array<{
    story_claim_id: string
    raw_text: string
    polarity: string
    stance: string | null
    extraction_confidence: number
    claim_id: string | null
    span_start: number | null
    span_end: number | null
    created_at: string
    linked_evidence_count: number
    linked_position_count: number
    linked_event_count: number
  }>
  evidence: Array<{
    evidence_id: string
    evidence_type: string
    excerpt: string
    attribution: string | null
    source_ref: string | null
    extraction_confidence: number
    span_start: number | null
    span_end: number | null
    created_at: string
    linked_claim_count: number
    linked_event_count: number
  }>
  positions: Array<{
    story_position_id: string
    raw_text: string
    extraction_confidence: number
    canonical_position_id: string | null
    excerpt_text: string | null
    speaker_type: string | null
    cue_phrases: unknown
    created_at: string
    linked_claim_count: number
    linked_evidence_count: number
  }>
  events: Array<{
    story_event_id: string
    event_summary: string
    extraction_confidence: number
    event_id: string | null
    primary_actor: string | null
    action: string | null
    object: string | null
    event_date: string | null
    event_timeframe_start: string | null
    event_timeframe_end: string | null
    location: string | null
    event_type: string | null
    created_at: string
    linked_claim_count: number
    linked_evidence_count: number
  }>
  links: {
    claimEvidence: Array<{
      story_claim_id: string
      evidence_id: string
      relation_type: string
      confidence: number
      rationale: string | null
    }>
    claimPosition: Array<{
      story_position_id: string
      story_claim_id: string
    }>
    positionEvidence: Array<{
      story_position_id: string
      evidence_id: string
    }>
    eventClaim: Array<{
      story_event_id: string
      story_claim_id: string
      relation_type: string
    }>
    eventEvidence: Array<{
      story_event_id: string
      evidence_id: string
    }>
    positionEventContext: Array<{
      story_position_id: string
      story_event_id: string
      link_path: string
    }>
  }
  feedback: Array<{
    id: string
    entity_type: string
    entity_id: string | null
    relationship_type: string | null
    relationship_source_id: string | null
    relationship_target_id: string | null
    rating: string
    notes: string | null
    issue_types: string[]
    pipeline_stage: string | null
    chunk_index: number | null
    created_at: string
  }>
  chunks: Array<{
    chunk_index: number
    friendly_id: string | null
    content: string
    extraction_json: unknown
    active_claim_version_id: string | null
    claim_version_count: number
    claim_versions: unknown[]
    claim_version_rows: unknown[]
    extraction_qa_status: ExtractionQaStatus
    extraction_qa_standardization_report: unknown
    extraction_qa_review_report: unknown
    extraction_qa_validation_report: unknown
    extraction_qa_refinement_count: number
    extraction_qa_validation_attempt_count: number
    extraction_qa_validated_at: string | null
    claims_merge_eligibility: unknown
    positions_extraction_json: unknown
    positions_qa_status: ExtractionQaStatus
    positions_qa_review_report: unknown
    positions_qa_validation_report: unknown
    positions_qa_refinement_count: number
    positions_qa_validation_attempt_count: number
    positions_qa_validated_at: string | null
    claims_lane_phase: ChunkLanePhase
    claims_lane_phase_label: string
    positions_lane_phase: ChunkLanePhase
    positions_lane_phase_label: string
  }>
  qa_artifacts: Array<{
    id: string
    stage: string
    chunk_index: number | null
    input_snapshot: unknown
    output_snapshot: unknown
    report: unknown
    run_id: string | null
    created_at: string
    reverted_at: string | null
    claim_version_id: string | null
    input_claim_version_id: string | null
    output_claim_version_id: string | null
  }>
  step_runs: Record<PipelineStepId, StoryStepLatestRow | null>
  step_run_history: Partial<Record<PipelineStepId, StoryStepRunHistoryRow[]>>
}

export function deriveExtractionStatus(row: {
  merged_at: string | null
  extraction_completed_at: string | null
  extraction_skipped_empty: boolean
}): ExtractionStatus {
  if (row.merged_at) return 'merged'
  if (row.extraction_completed_at) return 'extracted'
  if (row.extraction_skipped_empty) return 'skipped_empty'
  return 'pending_extraction'
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Internal server error'
}

export function extractEdgeFunctionError(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null) {
    const row = data as Record<string, unknown>
    if ('error' in row && row.error != null) return String(row.error)
    if ('message' in row && row.message != null) return String(row.message)
  }
  return `Edge Function ${status}`
}

const EMPTY_LINKS: StoryExtractionReviewPayload['links'] = {
  claimEvidence: [],
  claimPosition: [],
  positionEvidence: [],
  eventClaim: [],
  eventEvidence: [],
  positionEventContext: [],
}

/** Neo-path story payload: ingestion + step runs only (legacy claims arrays stubbed empty). */
export async function fetchStoryExtractionReview(
  supabase: SupabaseClient,
  storyIdOrFriendlyId: string
): Promise<StoryExtractionReviewPayload | null> {
  const storyId = await resolveStoryUuid(supabase, storyIdOrFriendlyId)
  if (!storyId) return null

  const { data: storyRow, error: storyErr } = await supabase
    .from('stories')
    .select(
      `story_id, friendly_id, title, url, author, published_at, fetched_at, created_at,
       content_snippet, content_full, relevance_status, relevance_score, relevance_ran_at,
       relevance_model, relevance_tags, pending_review_ran_at,
       scraped_at, scrape_dispatched_at, scrape_skipped, scrape_fail_count,
       extraction_completed_at, extraction_skipped_empty, merged_at,
       extraction_qa_status, extraction_qa_review_report, extraction_qa_validation_report,
       extraction_qa_refinement_count, extraction_qa_validated_at,
       sources(name)`
    )
    .eq('story_id', storyId)
    .single()

  if (storyErr || !storyRow) return null

  const src = storyRow.sources as { name: string } | { name: string }[] | null
  const sourceName = Array.isArray(src) ? src[0]?.name ?? null : src?.name ?? null

  const { data: bodyRow } = await supabase
    .from('story_bodies')
    .select('content_clean, content_raw, cleaned_at, content_length_clean')
    .eq('story_id', storyId)
    .maybeSingle()

  const contentClean = (bodyRow?.content_clean as string | null)?.trim() || null
  const contentRaw = (bodyRow?.content_raw as string | null)?.trim() || null
  const cleanedAt = (bodyRow?.cleaned_at as string | null) ?? null
  const contentLengthClean =
    bodyRow?.content_length_clean != null ? Number(bodyRow.content_length_clean) : null

  const articleText =
    contentClean ??
    contentRaw ??
    (storyRow.content_full as string | null) ??
    (storyRow.content_snippet as string | null)

  const [stepRuns, stepRunHistory] = await Promise.all([
    fetchStoryStepLatestByStep(supabase, storyId),
    fetchStoryStepRunHistory(supabase, storyId),
  ])

  const extractionStatus = deriveExtractionStatus({
    merged_at: (storyRow.merged_at as string | null) ?? null,
    extraction_completed_at: (storyRow.extraction_completed_at as string | null) ?? null,
    extraction_skipped_empty: Boolean(storyRow.extraction_skipped_empty),
  })

  return {
    story: {
      story_id: storyRow.story_id as string,
      friendly_id: storyRow.friendly_id as string,
      title: storyRow.title as string,
      url: storyRow.url as string,
      author: (storyRow.author as string | null) ?? null,
      published_at: (storyRow.published_at as string | null) ?? null,
      fetched_at: storyRow.fetched_at as string,
      created_at: storyRow.created_at as string,
      content_snippet: (storyRow.content_snippet as string | null) ?? null,
      content_full: (storyRow.content_full as string | null) ?? null,
      relevance_status: (storyRow.relevance_status as string | null) ?? null,
      relevance_score:
        storyRow.relevance_score != null ? Number(storyRow.relevance_score) : null,
      relevance_ran_at: (storyRow.relevance_ran_at as string | null) ?? null,
      relevance_model: (storyRow.relevance_model as string | null) ?? null,
      relevance_tags: (storyRow.relevance_tags as string[] | null) ?? null,
      pending_review_ran_at: (storyRow.pending_review_ran_at as string | null) ?? null,
      scraped_at: (storyRow.scraped_at as string | null) ?? null,
      scrape_dispatched_at: (storyRow.scrape_dispatched_at as string | null) ?? null,
      scrape_skipped: Boolean(storyRow.scrape_skipped),
      scrape_fail_count: Number(storyRow.scrape_fail_count ?? 0),
      has_content_clean: Boolean(contentClean),
      cleaned_at: cleanedAt,
      content_length_clean: contentLengthClean,
      extraction_completed_at: (storyRow.extraction_completed_at as string | null) ?? null,
      extraction_skipped_empty: Boolean(storyRow.extraction_skipped_empty),
      merged_at: (storyRow.merged_at as string | null) ?? null,
      extraction_status: extractionStatus,
      extraction_qa_status: (storyRow.extraction_qa_status as ExtractionQaStatus) ?? null,
      extraction_qa_review_report: storyRow.extraction_qa_review_report ?? null,
      extraction_qa_validation_report: storyRow.extraction_qa_validation_report ?? null,
      extraction_qa_refinement_count: Number(storyRow.extraction_qa_refinement_count ?? 0),
      extraction_qa_validated_at: (storyRow.extraction_qa_validated_at as string | null) ?? null,
      source_name: sourceName,
      article_text: articleText,
    },
    claims: [],
    evidence: [],
    positions: [],
    events: [],
    links: EMPTY_LINKS,
    feedback: [],
    chunks: [],
    qa_artifacts: [],
    step_runs: stepRuns,
    step_run_history: stepRunHistory,
  }
}

export async function countEntitiesByStory(
  supabase: SupabaseClient,
  storyIds: string[]
): Promise<
  Map<string, { claims: number; evidence: number; positions: number; events: number }>
> {
  void supabase
  const result = new Map<
    string,
    { claims: number; evidence: number; positions: number; events: number }
  >()
  for (const id of storyIds) {
    result.set(id, { claims: 0, evidence: 0, positions: 0, events: 0 })
  }
  return result
}

function formatDate(iso: string | null): string {
  return formatAdminDateTime(iso)
}

function bullet(label: string, value: string | number | null | undefined) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value)
  return `- ${label}: ${v}`
}

export function buildExtractionReviewMarkdown(payload: StoryExtractionReviewPayload): string {
  const { story } = payload
  const lines: string[] = []

  lines.push('# Story Pipeline Review', '')
  lines.push('## Story Metadata')
  lines.push(bullet('Title', story.title))
  lines.push(bullet('Source', story.source_name))
  lines.push(bullet('URL', story.url))
  lines.push(bullet('Published Date', formatDate(story.published_at)))
  lines.push(bullet('Ingested Date', formatDate(story.fetched_at)))
  lines.push(bullet('Story ID', story.friendly_id))
  lines.push(bullet('Has cleaned body', story.has_content_clean ? 'yes' : 'no'))
  lines.push('')
  lines.push('## Article Text', '')
  lines.push(story.article_text ?? '(no article text available)')
  lines.push('')
  lines.push('_Legacy claims/positions extraction removed — use Admin Neo._')
  lines.push('')

  return lines.join('\n')
}
