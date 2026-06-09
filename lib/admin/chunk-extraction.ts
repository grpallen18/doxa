import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'

type ChunkRecord = StoryExtractionReviewPayload['chunks'][number]

export type ChunkClaim = {
  chunk_index: number
  index: number
  claim_id: string | null
  raw_text: string
  polarity: string | null
  stance: string | null
  extraction_confidence: number | null
  source_excerpt: string | null
  span_start: number | null
  span_end: number | null
}

export type ChunkEvidence = {
  chunk_index: number
  index: number
  excerpt: string
  evidence_type: string | null
  attribution: string | null
  extraction_confidence: number | null
  source_excerpt: string | null
  span_start: number | null
  span_end: number | null
}

export type ChunkPosition = {
  chunk_index: number
  index: number
  raw_text: string
  speaker_type: string | null
  excerpt_text: string | null
  position_type: string | null
  holder: string | null
  extraction_confidence: number | null
  source_excerpt: string | null
  span_start: number | null
  span_end: number | null
}

export type ChunkEvent = {
  chunk_index: number
  index: number
  event_summary: string
  event_type: string | null
  primary_actor: string | null
  extraction_confidence: number | null
  source_excerpt: string | null
  span_start: number | null
  span_end: number | null
}

export type ChunkExtractionEntities = {
  claims: ChunkClaim[]
  evidence: ChunkEvidence[]
  positions: ChunkPosition[]
  events: ChunkEvent[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function flattenChunkEntities(chunks: ChunkRecord[]): ChunkExtractionEntities {
  const claims: ChunkClaim[] = []
  const evidence: ChunkEvidence[] = []
  const positions: ChunkPosition[] = []
  const events: ChunkEvent[] = []

  for (const chunk of chunks) {
    const blob = asRecord(chunk.extraction_json)
    if (!blob) continue

    asArray(blob.claims).forEach((row, index) => {
      const c = asRecord(row)
      if (!c) return
      const raw_text = str(c.raw_text)
      if (!raw_text) return
      claims.push({
        chunk_index: chunk.chunk_index,
        index,
        claim_id: str(c.claim_id),
        raw_text,
        polarity: str(c.polarity),
        stance: str(c.stance),
        extraction_confidence: num(c.extraction_confidence),
        source_excerpt: str(c.source_excerpt),
        span_start: num(c.span_start),
        span_end: num(c.span_end),
      })
    })

    asArray(blob.evidence).forEach((row, index) => {
      const e = asRecord(row)
      if (!e) return
      const excerpt = str(e.excerpt)
      if (!excerpt) return
      evidence.push({
        chunk_index: chunk.chunk_index,
        index,
        excerpt,
        evidence_type: str(e.evidence_type),
        attribution: str(e.attribution),
        extraction_confidence: num(e.extraction_confidence),
        source_excerpt: str(e.source_excerpt),
        span_start: num(e.span_start),
        span_end: num(e.span_end),
      })
    })

    asArray(blob.positions).forEach((row, index) => {
      const p = asRecord(row)
      if (!p) return
      const raw_text = str(p.raw_text)
      if (!raw_text) return
      positions.push({
        chunk_index: chunk.chunk_index,
        index,
        raw_text,
        speaker_type: str(p.speaker_type),
        excerpt_text: str(p.excerpt_text ?? p.source_excerpt),
        position_type: str(p.position_type),
        holder: str(p.holder),
        extraction_confidence: num(p.extraction_confidence),
        source_excerpt: str(p.source_excerpt ?? p.excerpt_text),
        span_start: num(p.span_start),
        span_end: num(p.span_end),
      })
    })

    asArray(blob.events).forEach((row, index) => {
      const ev = asRecord(row)
      if (!ev) return
      const event_summary = str(ev.event_summary)
      if (!event_summary) return
      events.push({
        chunk_index: chunk.chunk_index,
        index,
        event_summary,
        event_type: str(ev.event_type),
        primary_actor: str(ev.primary_actor),
        extraction_confidence: num(ev.extraction_confidence),
        source_excerpt: str(ev.source_excerpt),
        span_start: num(ev.span_start),
        span_end: num(ev.span_end),
      })
    })
  }

  return { claims, evidence, positions, events }
}

export function aggregateChunkEntityCounts(chunks: ChunkRecord[]) {
  const flat = flattenChunkEntities(chunks)
  return {
    claims: flat.claims.length,
    evidence: flat.evidence.length,
    positions: flat.positions.length,
    events: flat.events.length,
  }
}

export function flattenExtractionJson(
  chunkIndex: number,
  extractionJson: unknown
): ChunkExtractionEntities {
  return flattenChunkEntities([
    { chunk_index: chunkIndex, extraction_json: extractionJson } as ChunkRecord,
  ])
}

export function chunkEntityCounts(blob: unknown) {
  const flat = flattenChunkEntities([{ chunk_index: 0, extraction_json: blob } as ChunkRecord])
  return {
    claims: flat.claims.length,
    evidence: flat.evidence.length,
    positions: flat.positions.length,
    events: flat.events.length,
  }
}

export function mergedEntityCounts(payload: StoryExtractionReviewPayload) {
  return {
    claims: payload.claims.length,
    evidence: payload.evidence.length,
    positions: payload.positions.length,
    events: payload.events.length,
  }
}

type QaArtifact = StoryExtractionReviewPayload['qa_artifacts'][number]

const REFINE_STAGES = ['chunk_refine_claims', 'chunk_refine'] as const
const REVIEW_STAGES = ['chunk_review_claims', 'chunk_review'] as const

function latestArtifactForChunk(
  artifacts: QaArtifact[],
  chunkIndex: number,
  stages: readonly string[]
) {
  return artifacts.find((a) => a.chunk_index === chunkIndex && stages.includes(a.stage))
}

/** Pre-refine extraction: latest refine input snapshot, else latest review input, else live chunk JSON. */
export function resolvePreRefineExtractionJson(
  chunk: ChunkRecord,
  artifacts: QaArtifact[]
): unknown {
  const refine = latestArtifactForChunk(artifacts, chunk.chunk_index, REFINE_STAGES)
  if (refine?.input_snapshot != null) return refine.input_snapshot
  const review = latestArtifactForChunk(artifacts, chunk.chunk_index, REVIEW_STAGES)
  if (review?.input_snapshot != null) return review.input_snapshot
  return chunk.extraction_json
}

/** Post-refine extraction: latest refine output snapshot when present, else live chunk JSON. */
export function resolvePostRefineExtractionJson(
  chunk: ChunkRecord,
  artifacts: QaArtifact[]
): unknown {
  const refine = latestArtifactForChunk(artifacts, chunk.chunk_index, REFINE_STAGES)
  if (refine?.output_snapshot != null) return refine.output_snapshot
  return chunk.extraction_json
}
