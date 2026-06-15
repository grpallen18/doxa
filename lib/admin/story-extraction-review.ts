import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractionQaStatus } from '@/lib/admin/extraction-qa-types'
import {
  fetchStoryClaimVersions,
  mapClaimVersionsForExport,
  type ChunkClaimVersionSummary,
  type ClaimVersionExportRow,
} from '@/lib/admin/chunk-qa-history'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import type { PipelineStepId } from '@/lib/admin/generated/pipeline-catalog'
import {
  deriveChunkLanePhase,
  chunkLanePhaseLabel,
  type ChunkLanePhase,
} from '@/lib/admin/pipeline-status/chunk-phase'
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
    issue_types: string[] | null
    pipeline_stage: string | null
    chunk_index: number | null
    created_at: string
  }>
  chunks: Array<{
    chunk_index: number
    friendly_id: string
    content: string | null
    extraction_json: unknown
    active_claim_version_id: string | null
    claim_version_count: number
    claim_version_lineage: ClaimVersionExportRow[]
    claim_versions: ChunkClaimVersionSummary[]
    extraction_qa_status: ExtractionQaStatus
    extraction_qa_standardization_report: unknown
    extraction_qa_review_report: unknown
    extraction_qa_validation_report: unknown
    extraction_qa_refinement_count: number
    extraction_qa_validation_attempt_count: number
    extraction_qa_validated_at: string | null
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

function increment(map: Map<string, number>, key: string, delta = 1) {
  map.set(key, (map.get(key) ?? 0) + delta)
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

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST204') return true
  const msg = error.message ?? ''
  return msg.includes('does not exist') || msg.includes('Could not find') || msg.includes('not found')
}

function isPermissionDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42501') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('permission denied') || msg.includes('row-level security')
}

async function queryTableWithLegacy<T>(
  supabase: SupabaseClient,
  primary: string,
  legacy: string | null,
  run: (table: string) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
): Promise<T[]> {
  const primaryRes = await run(primary)
  if (!primaryRes.error) return primaryRes.data ?? []
  if (legacy && isMissingRelation(primaryRes.error)) {
    const legacyRes = await run(legacy)
    if (!legacyRes.error) return legacyRes.data ?? []
    if (isMissingRelation(legacyRes.error) || isPermissionDenied(legacyRes.error)) return []
    throw legacyRes.error
  }
  if (isMissingRelation(primaryRes.error) || isPermissionDenied(primaryRes.error)) return []
  throw primaryRes.error
}

async function loadStoryLinks(
  supabase: SupabaseClient,
  claimIds: string[],
  evidenceIds: string[],
  positionIds: string[],
  eventIds: string[]
): Promise<StoryExtractionReviewPayload['links']> {
  const claimEvidence: StoryExtractionReviewPayload['links']['claimEvidence'] = []
  if (claimIds.length > 0) {
    const { data: ceRows, error } = await supabase
      .from('story_claim_evidence_links')
      .select('story_claim_id, evidence_id, relation_type, confidence, rationale')
      .in('story_claim_id', claimIds)
    if (error) throw error
    for (const r of ceRows ?? []) {
      claimEvidence.push({
        story_claim_id: r.story_claim_id,
        evidence_id: r.evidence_id,
        relation_type: r.relation_type,
        confidence: Number(r.confidence),
        rationale: r.rationale,
      })
    }
  }

  const claimPosition = claimIds.length
    ? await queryTableWithLegacy(
        supabase,
        'story_position_claim_links',
        'story_position_claims',
        (table) =>
          supabase
            .from(table)
            .select('story_position_id, story_claim_id')
            .in('story_claim_id', claimIds)
      )
    : []

  const positionEvidence = positionIds.length
    ? await queryTableWithLegacy(
        supabase,
        'story_position_evidence_links',
        'story_position_evidence',
        (table) =>
          supabase
            .from(table)
            .select('story_position_id, evidence_id')
            .in('story_position_id', positionIds)
      )
    : []

  const eventClaim = eventIds.length
    ? await queryTableWithLegacy(
        supabase,
        'story_event_claim_links',
        'story_event_claims',
        (table) =>
          supabase
            .from(table)
            .select('story_event_id, story_claim_id, relation_type')
            .in('story_event_id', eventIds)
      )
    : []

  const eventEvidence = eventIds.length
    ? await queryTableWithLegacy(
        supabase,
        'story_event_evidence_links',
        'story_event_evidence',
        (table) =>
          supabase
            .from(table)
            .select('story_event_id, evidence_id')
            .in('story_event_id', eventIds)
      )
    : []

  let positionEventContext: StoryExtractionReviewPayload['links']['positionEventContext'] = []
  if (positionIds.length > 0) {
    const { data, error } = await supabase
      .from('story_position_event_context')
      .select('story_position_id, story_event_id, link_path')
      .in('story_position_id', positionIds)
    if (!error) {
      const eventIdSet = new Set(eventIds)
      positionEventContext = (data ?? []).filter((r) => eventIdSet.has(r.story_event_id))
    } else if (!isMissingRelation(error)) {
      throw error
    }
  }

  return {
    claimEvidence,
    claimPosition: claimPosition.map((r) => ({
      story_position_id: r.story_position_id,
      story_claim_id: r.story_claim_id,
    })),
    positionEvidence: positionEvidence.map((r) => ({
      story_position_id: r.story_position_id,
      evidence_id: r.evidence_id,
    })),
    eventClaim: eventClaim.map((r) => ({
      story_event_id: r.story_event_id,
      story_claim_id: r.story_claim_id,
      relation_type: r.relation_type,
    })),
    eventEvidence: eventEvidence.map((r) => ({
      story_event_id: r.story_event_id,
      evidence_id: r.evidence_id,
    })),
    positionEventContext,
  }
}

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

  const [claimsRes, evidenceRes, positionsRes, eventsRes, feedbackRows, chunksRes, artifactsRes, claimVersionsAll, stepRuns, stepRunHistory] =
    await Promise.all([
    supabase
      .from('story_claims')
      .select(
        'story_claim_id, raw_text, polarity, stance, extraction_confidence, claim_id, span_start, span_end, created_at'
      )
      .eq('story_id', storyId)
      .order('created_at', { ascending: true }),
    supabase
      .from('story_evidence')
      .select(
        'evidence_id, evidence_type, excerpt, attribution, source_ref, extraction_confidence, span_start, span_end, created_at'
      )
      .eq('story_id', storyId)
      .order('created_at', { ascending: true }),
    supabase
      .from('story_positions')
      .select(
        'story_position_id, raw_text, extraction_confidence, canonical_position_id, excerpt_text, speaker_type, cue_phrases, created_at'
      )
      .eq('story_id', storyId)
      .order('created_at', { ascending: true }),
    supabase
      .from('story_events')
      .select(
        'story_event_id, event_summary, extraction_confidence, event_id, primary_actor, action, event_object:object, event_date, event_timeframe_start, event_timeframe_end, location, event_type, created_at'
      )
      .eq('story_id', storyId)
      .order('created_at', { ascending: true }),
    queryTableWithLegacy(
      supabase,
      'story_extraction_feedback',
      null,
      (table) =>
        supabase
          .from(table)
          .select(
            'id, entity_type, entity_id, relationship_type, relationship_source_id, relationship_target_id, rating, notes, issue_types, pipeline_stage, chunk_index, created_at'
          )
          .eq('story_id', storyId)
          .order('created_at', { ascending: false })
    ),
    supabase
      .from('story_chunks')
      .select(
        'chunk_index, friendly_id, content, extraction_json, active_claim_version_id, extraction_qa_status, extraction_qa_standardization_report, extraction_qa_review_report, extraction_qa_validation_report, extraction_qa_refinement_count, extraction_qa_validation_attempt_count, extraction_qa_validated_at, positions_extraction_json, positions_qa_status, positions_qa_review_report, positions_qa_validation_report, positions_qa_refinement_count, positions_qa_validation_attempt_count, positions_qa_validated_at'
      )
      .eq('story_id', storyId)
      .order('chunk_index', { ascending: true }),
    queryTableWithLegacy(
      supabase,
      'story_extraction_qa_artifacts',
      null,
      (table) =>
        supabase
          .from(table)
          .select('id, stage, chunk_index, input_snapshot, output_snapshot, report, run_id, created_at, reverted_at')
          .eq('story_id', storyId)
          .order('created_at', { ascending: false })
          .limit(200)
    ),
    fetchStoryClaimVersions(supabase, storyId),
    fetchStoryStepLatestByStep(supabase, storyId),
    fetchStoryStepRunHistory(supabase, storyId),
  ])

  for (const res of [claimsRes, evidenceRes, positionsRes, eventsRes]) {
    if (res.error) throw res.error
  }
  if (chunksRes.error && !isMissingRelation(chunksRes.error)) throw chunksRes.error

  const claims = claimsRes.data ?? []
  const evidence = evidenceRes.data ?? []
  const positions = positionsRes.data ?? []
  const events = (eventsRes.data ?? []).map((ev) => {
    const row = ev as typeof ev & { event_object?: string | null }
    return {
      story_event_id: row.story_event_id,
      event_summary: row.event_summary,
      extraction_confidence: row.extraction_confidence,
      event_id: row.event_id,
      primary_actor: row.primary_actor,
      action: row.action,
      object: row.event_object ?? null,
      event_date: row.event_date,
      event_timeframe_start: row.event_timeframe_start,
      event_timeframe_end: row.event_timeframe_end,
      location: row.location,
      event_type: row.event_type,
      created_at: row.created_at,
    }
  })
  const claimIds = claims.map((c) => c.story_claim_id)
  const evidenceIds = evidence.map((e) => e.evidence_id)
  const positionIds = positions.map((p) => p.story_position_id)
  const eventIds = events.map((e) => e.story_event_id)

  const links = await loadStoryLinks(supabase, claimIds, evidenceIds, positionIds, eventIds)
  const { claimEvidence, claimPosition, positionEvidence, eventClaim, eventEvidence, positionEventContext } =
    links

  const claimEvidenceCount = new Map<string, number>()
  const claimPositionCount = new Map<string, number>()
  const claimEventCount = new Map<string, number>()
  const evidenceClaimCount = new Map<string, number>()
  const evidenceEventCount = new Map<string, number>()
  const positionClaimCount = new Map<string, number>()
  const positionEvidenceCount = new Map<string, number>()
  const eventClaimCount = new Map<string, number>()
  const eventEvidenceCount = new Map<string, number>()

  for (const link of claimEvidence) {
    increment(claimEvidenceCount, link.story_claim_id)
    increment(evidenceClaimCount, link.evidence_id)
  }
  for (const link of claimPosition) {
    increment(claimPositionCount, link.story_claim_id)
    increment(positionClaimCount, link.story_position_id)
  }
  for (const link of positionEvidence) {
    increment(positionEvidenceCount, link.story_position_id)
  }
  for (const link of eventClaim) {
    increment(claimEventCount, link.story_claim_id)
    increment(eventClaimCount, link.story_event_id)
  }
  for (const link of eventEvidence) {
    increment(evidenceEventCount, link.evidence_id)
    increment(eventEvidenceCount, link.story_event_id)
  }

  const claimVersionsByChunk = new Map<number, ClaimVersionExportRow[]>()
  const claimVersionRowsByChunk = new Map<number, ChunkClaimVersionSummary[]>()
  for (const version of claimVersionsAll) {
    const chunkIndex = version.chunk_index
    if (chunkIndex == null) continue
    const exportList = claimVersionsByChunk.get(chunkIndex) ?? []
    exportList.push(...mapClaimVersionsForExport([version]))
    claimVersionsByChunk.set(chunkIndex, exportList)
    const rowList = claimVersionRowsByChunk.get(chunkIndex) ?? []
    rowList.push(version)
    claimVersionRowsByChunk.set(chunkIndex, rowList)
  }

  const claimVersionCounts = new Map<number, number>()
  for (const version of claimVersionsAll) {
    const chunkIndex = version.chunk_index
    if (chunkIndex == null) continue
    claimVersionCounts.set(chunkIndex, (claimVersionCounts.get(chunkIndex) ?? 0) + 1)
  }

  return {
    story: {
      story_id: storyRow.story_id,
      friendly_id: storyRow.friendly_id as string,
      title: storyRow.title,
      url: storyRow.url,
      author: storyRow.author,
      published_at: storyRow.published_at,
      fetched_at: storyRow.fetched_at,
      created_at: storyRow.created_at,
      content_snippet: storyRow.content_snippet,
      content_full: storyRow.content_full,
      relevance_status: storyRow.relevance_status,
      relevance_score: storyRow.relevance_score,
      relevance_ran_at: storyRow.relevance_ran_at as string | null,
      relevance_model: (storyRow.relevance_model as string | null) ?? null,
      relevance_tags: (storyRow.relevance_tags as string[] | null) ?? null,
      pending_review_ran_at: storyRow.pending_review_ran_at as string | null,
      scraped_at: storyRow.scraped_at as string | null,
      scrape_dispatched_at: storyRow.scrape_dispatched_at as string | null,
      scrape_skipped: Boolean(storyRow.scrape_skipped),
      scrape_fail_count: Number(storyRow.scrape_fail_count ?? 0),
      has_content_clean: Boolean(contentClean),
      cleaned_at: cleanedAt,
      content_length_clean: contentLengthClean,
      extraction_completed_at: storyRow.extraction_completed_at,
      extraction_skipped_empty: storyRow.extraction_skipped_empty,
      merged_at: storyRow.merged_at,
      extraction_status: deriveExtractionStatus(storyRow),
      extraction_qa_status: (storyRow.extraction_qa_status as ExtractionQaStatus) ?? null,
      extraction_qa_review_report: storyRow.extraction_qa_review_report,
      extraction_qa_validation_report: storyRow.extraction_qa_validation_report,
      extraction_qa_refinement_count: Number(storyRow.extraction_qa_refinement_count ?? 0),
      extraction_qa_validated_at: storyRow.extraction_qa_validated_at as string | null,
      source_name: sourceName,
      article_text: articleText,
    },
    claims: claims.map((c) => ({
      story_claim_id: c.story_claim_id,
      raw_text: c.raw_text,
      polarity: c.polarity,
      stance: c.stance,
      extraction_confidence: Number(c.extraction_confidence),
      claim_id: c.claim_id,
      span_start: c.span_start,
      span_end: c.span_end,
      created_at: c.created_at,
      linked_evidence_count: claimEvidenceCount.get(c.story_claim_id) ?? 0,
      linked_position_count: claimPositionCount.get(c.story_claim_id) ?? 0,
      linked_event_count: claimEventCount.get(c.story_claim_id) ?? 0,
    })),
    evidence: evidence.map((e) => ({
      evidence_id: e.evidence_id,
      evidence_type: e.evidence_type,
      excerpt: e.excerpt,
      attribution: e.attribution,
      source_ref: e.source_ref,
      extraction_confidence: Number(e.extraction_confidence),
      span_start: e.span_start,
      span_end: e.span_end,
      created_at: e.created_at,
      linked_claim_count: evidenceClaimCount.get(e.evidence_id) ?? 0,
      linked_event_count: evidenceEventCount.get(e.evidence_id) ?? 0,
    })),
    positions: positions.map((p) => ({
      story_position_id: p.story_position_id,
      raw_text: p.raw_text,
      extraction_confidence: Number(p.extraction_confidence),
      canonical_position_id: p.canonical_position_id,
      excerpt_text: p.excerpt_text,
      speaker_type: p.speaker_type,
      cue_phrases: p.cue_phrases,
      created_at: p.created_at,
      linked_claim_count: positionClaimCount.get(p.story_position_id) ?? 0,
      linked_evidence_count: positionEvidenceCount.get(p.story_position_id) ?? 0,
    })),
    events: events.map((ev) => ({
      story_event_id: ev.story_event_id,
      event_summary: ev.event_summary,
      extraction_confidence: Number(ev.extraction_confidence),
      event_id: ev.event_id,
      primary_actor: ev.primary_actor,
      action: ev.action,
      object: ev.object,
      event_date: ev.event_date,
      event_timeframe_start: ev.event_timeframe_start,
      event_timeframe_end: ev.event_timeframe_end,
      location: ev.location,
      event_type: ev.event_type,
      created_at: ev.created_at,
      linked_claim_count: eventClaimCount.get(ev.story_event_id) ?? 0,
      linked_evidence_count: eventEvidenceCount.get(ev.story_event_id) ?? 0,
    })),
    links: {
      claimEvidence,
      claimPosition,
      positionEvidence,
      eventClaim,
      eventEvidence,
      positionEventContext,
    },
    feedback: feedbackRows.map((f) => ({
      id: f.id,
      entity_type: f.entity_type,
      entity_id: f.entity_id,
      relationship_type: f.relationship_type,
      relationship_source_id: f.relationship_source_id,
      relationship_target_id: f.relationship_target_id,
      rating: f.rating,
      notes: f.notes,
      issue_types: (f as { issue_types?: string[] | null }).issue_types ?? null,
      pipeline_stage: (f as { pipeline_stage?: string | null }).pipeline_stage ?? null,
      chunk_index: (f as { chunk_index?: number | null }).chunk_index ?? null,
      created_at: f.created_at,
    })),
    chunks: (chunksRes.data ?? []).map((c) => {
      const chunkRow = {
        chunk_index: c.chunk_index as number,
        friendly_id: c.friendly_id as string,
        content: c.content as string | null,
        extraction_json: c.extraction_json,
        active_claim_version_id: (c.active_claim_version_id as string | null) ?? null,
        claim_version_count: claimVersionCounts.get(c.chunk_index as number) ?? 0,
        claim_version_lineage: claimVersionsByChunk.get(c.chunk_index as number) ?? [],
        claim_versions: claimVersionRowsByChunk.get(c.chunk_index as number) ?? [],
        extraction_qa_status: (c.extraction_qa_status as ExtractionQaStatus) ?? null,
        extraction_qa_standardization_report: c.extraction_qa_standardization_report,
        extraction_qa_review_report: c.extraction_qa_review_report,
        extraction_qa_validation_report: c.extraction_qa_validation_report,
        extraction_qa_refinement_count: Number(c.extraction_qa_refinement_count ?? 0),
        extraction_qa_validation_attempt_count: Number(
          c.extraction_qa_validation_attempt_count ?? 0
        ),
        extraction_qa_validated_at: c.extraction_qa_validated_at as string | null,
        positions_extraction_json: c.positions_extraction_json,
        positions_qa_status: (c.positions_qa_status as ExtractionQaStatus) ?? null,
        positions_qa_review_report: c.positions_qa_review_report,
        positions_qa_validation_report: c.positions_qa_validation_report,
        positions_qa_refinement_count: Number(c.positions_qa_refinement_count ?? 0),
        positions_qa_validation_attempt_count: Number(
          c.positions_qa_validation_attempt_count ?? 0
        ),
        positions_qa_validated_at: c.positions_qa_validated_at as string | null,
        claims_lane_phase: 'not_started' as ChunkLanePhase,
        claims_lane_phase_label: '',
        positions_lane_phase: 'not_started' as ChunkLanePhase,
        positions_lane_phase_label: '',
      }
      const claimsPhase = deriveChunkLanePhase('claims', chunkRow)
      const positionsPhase = deriveChunkLanePhase('positions', chunkRow)
      return {
        ...chunkRow,
        claims_lane_phase: claimsPhase,
        claims_lane_phase_label: chunkLanePhaseLabel('claims', chunkRow),
        positions_lane_phase: positionsPhase,
        positions_lane_phase_label: chunkLanePhaseLabel('positions', chunkRow),
      }
    }),
    qa_artifacts: (artifactsRes ?? []).map((a) => ({
      id: a.id as string,
      stage: a.stage as string,
      chunk_index: a.chunk_index as number | null,
      input_snapshot: a.input_snapshot,
      output_snapshot: a.output_snapshot,
      report: a.report,
      run_id: (a.run_id as string | null) ?? null,
      created_at: a.created_at as string,
      reverted_at: (a.reverted_at as string | null) ?? null,
    })),
    step_runs: stepRuns,
    step_run_history: stepRunHistory,
  }
}

export async function countEntitiesByStory(
  supabase: SupabaseClient,
  storyIds: string[]
): Promise<
  Map<
    string,
    { claims: number; evidence: number; positions: number; events: number }
  >
> {
  const result = new Map<
    string,
    { claims: number; evidence: number; positions: number; events: number }
  >()
  for (const id of storyIds) {
    result.set(id, { claims: 0, evidence: 0, positions: 0, events: 0 })
  }
  if (storyIds.length === 0) return result

  const tables = [
    ['story_claims', 'claims'] as const,
    ['story_evidence', 'evidence'] as const,
    ['story_positions', 'positions'] as const,
    ['story_events', 'events'] as const,
  ]

  await Promise.all(
    tables.map(async ([table, key]) => {
      const { data } = await supabase.from(table).select('story_id').in('story_id', storyIds)
      for (const row of data ?? []) {
        const entry = result.get(row.story_id as string)
        if (entry) entry[key] += 1
      }
    })
  )

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
  const { story, claims, evidence, positions, events, links } = payload
  const lines: string[] = []

  lines.push('# Story Extraction Review', '')
  lines.push('## Story Metadata')
  lines.push(bullet('Title', story.title))
  lines.push(bullet('Source', story.source_name))
  lines.push(bullet('URL', story.url))
  lines.push(bullet('Published Date', formatDate(story.published_at)))
  lines.push(bullet('Ingested Date', formatDate(story.fetched_at)))
  lines.push(bullet('Story ID', story.friendly_id))
  lines.push(bullet('Extraction Status', story.extraction_status))
  lines.push(bullet('QA Status', story.extraction_qa_status ?? '—'))
  lines.push('')

  lines.push('## Article Text', '')
  lines.push(story.article_text ?? '(no article text available)')
  lines.push('')

  lines.push('## Extracted Claims', '')
  claims.forEach((c, i) => {
    lines.push(`### Claim ${i + 1}`)
    lines.push(bullet('ID', c.story_claim_id))
    lines.push(bullet('Text', c.raw_text))
    lines.push(bullet('Polarity', c.polarity))
    lines.push(bullet('Stance', c.stance))
    lines.push(bullet('Confidence', c.extraction_confidence))
    lines.push(bullet('Canonical Claim ID', c.claim_id))
    lines.push(bullet('Linked Evidence', c.linked_evidence_count))
    lines.push(bullet('Linked Positions', c.linked_position_count))
    lines.push(bullet('Linked Events', c.linked_event_count))
    lines.push('')
  })

  lines.push('## Extracted Evidence', '')
  evidence.forEach((e, i) => {
    lines.push(`### Evidence ${i + 1}`)
    lines.push(bullet('ID', e.evidence_id))
    lines.push(bullet('Text', e.excerpt))
    lines.push(bullet('Type', e.evidence_type))
    lines.push(bullet('Attribution', e.attribution))
    lines.push(bullet('Confidence', e.extraction_confidence))
    lines.push(bullet('Linked Claims', e.linked_claim_count))
    lines.push(bullet('Linked Events', e.linked_event_count))
    lines.push('')
  })

  lines.push('## Extracted Positions', '')
  positions.forEach((p, i) => {
    lines.push(`### Position ${i + 1}`)
    lines.push(bullet('ID', p.story_position_id))
    lines.push(bullet('Text', p.raw_text))
    lines.push(bullet('Speaker', p.speaker_type))
    lines.push(bullet('Confidence', p.extraction_confidence))
    lines.push(bullet('Linked Claims', p.linked_claim_count))
    lines.push(bullet('Canonical Position ID', p.canonical_position_id))
    lines.push('')
  })

  lines.push('## Extracted Events', '')
  events.forEach((ev, i) => {
    lines.push(`### Event ${i + 1}`)
    lines.push(bullet('ID', ev.story_event_id))
    lines.push(bullet('Summary', ev.event_summary))
    lines.push(
      bullet(
        'Date/Timeframe',
        [ev.event_date, ev.event_timeframe_start, ev.event_timeframe_end].filter(Boolean).join(' – ') || null
      )
    )
    lines.push(bullet('Actors', ev.primary_actor))
    lines.push(bullet('Action', ev.action))
    lines.push(bullet('Object', ev.object))
    lines.push(bullet('Location', ev.location))
    lines.push(bullet('Type', ev.event_type))
    lines.push(bullet('Confidence', ev.extraction_confidence))
    lines.push(bullet('Linked Claims', ev.linked_claim_count))
    lines.push(bullet('Linked Evidence', ev.linked_evidence_count))
    lines.push(bullet('Canonical Event ID', ev.event_id))
    lines.push('')
  })

  lines.push('## Relationship Summary', '')
  lines.push('### Claim → Evidence Links')
  for (const l of links.claimEvidence) {
    lines.push(`- ${l.story_claim_id} → ${l.evidence_id} (${l.relation_type}, conf ${l.confidence})`)
  }
  lines.push('')
  lines.push('### Claim → Position Links')
  for (const l of links.claimPosition) {
    lines.push(`- claim ${l.story_claim_id} ↔ position ${l.story_position_id}`)
  }
  lines.push('')
  lines.push('### Position → Evidence Links')
  for (const l of links.positionEvidence) {
    lines.push(`- position ${l.story_position_id} ↔ evidence ${l.evidence_id}`)
  }
  lines.push('')
  lines.push('### Event → Claim Links')
  for (const l of links.eventClaim) {
    lines.push(`- event ${l.story_event_id} → claim ${l.story_claim_id} (${l.relation_type})`)
  }
  lines.push('')
  lines.push('### Event → Evidence Links')
  for (const l of links.eventEvidence) {
    lines.push(`- event ${l.story_event_id} → evidence ${l.evidence_id}`)
  }
  lines.push('')
  lines.push('### Derived Position → Event Context (via claims/evidence)')
  for (const l of links.positionEventContext) {
    lines.push(`- position ${l.story_position_id} ↔ event ${l.story_event_id} (${l.link_path})`)
  }
  lines.push('')

  lines.push('## Review Prompt', '')
  lines.push(
    'Please review the article text and extracted outputs above. Identify:\n' +
      '1. Missing claims, evidence, positions, or events.\n' +
      '2. Over-extracted or hallucinated items.\n' +
      '3. Duplicates or overly granular extractions.\n' +
      '4. Weak or incorrect relationships.\n' +
      '5. Prompting changes that would improve future extraction quality.'
  )

  return lines.join('\n')
}

export function buildExtractionReviewJson(payload: StoryExtractionReviewPayload): string {
  return JSON.stringify(payload, null, 2)
}
