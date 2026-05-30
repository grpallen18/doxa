'use client'

import type { ReactNode } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import type { PipelineStepId } from '@/lib/admin/story-pipeline-checklist'
import {
  chunkEntityCounts,
  flattenExtractionJson,
  mergedEntityCounts,
  resolvePostRefineExtractionJson,
  resolvePreRefineExtractionJson,
} from '@/lib/admin/chunk-extraction'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import { StepDetailReveal } from './step-detail-reveal'

function EmptyDetail({ message }: { message: string }) {
  return <p className="text-xs text-muted">{message}</p>
}

function EntitySection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="mt-2">
      <h4 className="text-xs font-medium text-muted">
        {title} ({count})
      </h4>
      <div className="mt-1 space-y-1.5">{children}</div>
    </section>
  )
}

function ReportFindings({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const r = report as { findings?: Array<{ severity?: string; description?: string; type?: string }> }
  const findings = r.findings ?? []
  if (findings.length === 0) return <EmptyDetail message="No findings." />
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-xs">
          <span className="font-medium capitalize">{f.severity ?? 'note'}</span>
          {f.type ? ` · ${f.type.replace(/_/g, ' ')}` : ''}: {f.description}
        </li>
      ))}
    </ul>
  )
}

function RefinePatches({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const patches = (report as { patches?: unknown[] }).patches ?? []
  if (patches.length === 0) return <EmptyDetail message="No patches applied." />
  return (
    <ul className="space-y-1.5">
      {patches.map((p, i) => (
        <li key={i} className="rounded bg-muted/20 px-2 py-1.5 font-mono text-xs">
          {JSON.stringify(p)}
        </li>
      ))}
    </ul>
  )
}

function ValidationSummary({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const r = report as {
    passes?: boolean
    recommended_status?: string
    blocking_issues?: string[]
    scores?: Record<string, number>
  }
  return (
    <div className="space-y-2 text-xs">
      {r.passes != null && (
        <p>
          Passes: <span className="font-medium">{r.passes ? 'Yes' : 'No'}</span>
          {r.recommended_status ? ` · ${r.recommended_status.replace(/_/g, ' ')}` : ''}
        </p>
      )}
      {r.scores && (
        <p className="text-muted">
          Scores:{' '}
          {Object.entries(r.scores)
            .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
            .join(' · ')}
        </p>
      )}
      {(r.blocking_issues?.length ?? 0) > 0 && (
        <ul className="space-y-1">
          {r.blocking_issues!.map((issue, i) => (
            <li key={i} className="rounded bg-muted/20 px-2 py-1.5">
              {issue}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ChunkEntityList({ chunkIndex, extractionJson }: { chunkIndex: number; extractionJson: unknown }) {
  const counts = chunkEntityCounts(extractionJson)
  const flat = flattenExtractionJson(chunkIndex, extractionJson)
  return (
    <>
      <EntitySection title="Claims" count={counts.claims}>
        {flat.claims.map((c) => (
          <p key={c.index} className="rounded bg-muted/20 p-2 text-xs">
            {c.raw_text}
          </p>
        ))}
      </EntitySection>
      <EntitySection title="Evidence" count={counts.evidence}>
        {flat.evidence.map((e) => (
          <p key={e.index} className="rounded bg-muted/20 p-2 text-xs">
            {e.excerpt}
          </p>
        ))}
      </EntitySection>
      <EntitySection title="Positions" count={counts.positions}>
        {flat.positions.map((p) => (
          <p key={p.index} className="rounded bg-muted/20 p-2 text-xs">
            {p.raw_text}
          </p>
        ))}
      </EntitySection>
      <EntitySection title="Events" count={counts.events}>
        {flat.events.map((ev) => (
          <p key={ev.index} className="rounded bg-muted/20 p-2 text-xs">
            {ev.event_summary}
          </p>
        ))}
      </EntitySection>
    </>
  )
}

function ChunkExtractionsDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  if (payload.chunks.length === 0) {
    return <EmptyDetail message="No chunks yet." />
  }
  const extracted = payload.chunks.filter((c) => c.extraction_json != null)
  if (extracted.length === 0) {
    return <EmptyDetail message="No chunk extractions yet." />
  }

  return (
    <ul className="space-y-3">
      {extracted.map((ch) => {
        const extractionJson = resolvePreRefineExtractionJson(ch, payload.qa_artifacts)
        return (
          <li key={ch.chunk_index} className="rounded border border-subtle p-2">
            <p className="text-xs font-medium">
              Chunk {ch.chunk_index} · QA {qaStatusLabel(ch.extraction_qa_status)}
            </p>
            <div className="mt-2">
              <p className="mb-1 text-xs text-muted">Extraction before refine</p>
              <ChunkEntityList chunkIndex={ch.chunk_index} extractionJson={extractionJson} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ChunkQaDetail({
  payload,
  kind,
}: {
  payload: StoryExtractionReviewPayload
  kind: 'review' | 'refine' | 'validate'
}) {
  const chunks = payload.chunks.filter((c) => c.extraction_json != null)
  if (chunks.length === 0) return <EmptyDetail message="No chunks to show." />

  const reportKey =
    kind === 'validate' ? 'extraction_qa_validation_report' : 'extraction_qa_review_report'
  const stage =
    kind === 'review' ? 'chunk_review' : kind === 'refine' ? 'chunk_refine' : 'chunk_validate'

  const relevant = chunks.filter((c) => {
    if (kind === 'refine') return (c.extraction_qa_refinement_count ?? 0) > 0
    if (kind === 'validate') return c.extraction_qa_validation_report != null
    return c.extraction_qa_review_report != null
  })

  if (relevant.length === 0) {
    return <EmptyDetail message={`No chunk ${kind} output yet.`} />
  }

  return (
    <ul className="space-y-3">
      {relevant.map((ch) => {
        const artifacts = payload.qa_artifacts.filter(
          (a) => a.stage === stage && a.chunk_index === ch.chunk_index
        )
        return (
          <li key={ch.chunk_index} className="rounded border border-subtle p-2">
            <p className="text-xs font-medium">
              Chunk {ch.chunk_index} · {qaStatusLabel(ch.extraction_qa_status)}
              {kind === 'refine' && (ch.extraction_qa_refinement_count ?? 0) > 0
                ? ` · refined ${ch.extraction_qa_refinement_count}×`
                : ''}
            </p>
            {kind === 'refine' ? (
              <>
                {artifacts[0]?.report ? (
                  <div className="mt-2">
                    <p className="mb-1 text-xs text-muted">Patches applied</p>
                    <RefinePatches report={artifacts[0].report} />
                  </div>
                ) : null}
                <div className="mt-2">
                  <p className="mb-1 text-xs text-muted">Extraction after refine</p>
                  <ChunkEntityList
                    chunkIndex={ch.chunk_index}
                    extractionJson={resolvePostRefineExtractionJson(ch, payload.qa_artifacts)}
                  />
                </div>
              </>
            ) : kind === 'validate' ? (
              <div className="mt-2">
                <ValidationSummary report={ch[reportKey]} />
              </div>
            ) : (
              <div className="mt-2">
                <ReportFindings report={ch.extraction_qa_review_report} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function MergedEntitiesDetail({
  payload,
  renderFeedback,
}: {
  payload: StoryExtractionReviewPayload
  renderFeedback?: PipelineStepDetailProps['renderFeedback']
}) {
  if (payload.story.merged_at == null) {
    return <EmptyDetail message="Not merged yet." />
  }
  const counts = mergedEntityCounts(payload)
  const total = counts.claims + counts.evidence + counts.positions + counts.events
  if (total === 0) return <EmptyDetail message="Merged with no entities." />

  return (
    <div className="rounded border border-subtle p-2">
      <p className="text-xs font-medium">QA: {qaStatusLabel(payload.story.extraction_qa_status)}</p>
      <EntitySection title="Claims" count={counts.claims}>
        {payload.claims.map((c) => (
          <div key={c.story_claim_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{c.raw_text}</p>
            {renderFeedback?.({
              entityType: 'claim',
              entityId: c.story_claim_id,
              existingRating: payload.feedback.find(
                (f) => f.entity_type === 'claim' && f.entity_id === c.story_claim_id
              )?.rating,
            })}
          </div>
        ))}
      </EntitySection>
      <EntitySection title="Evidence" count={counts.evidence}>
        {payload.evidence.map((e) => (
          <div key={e.evidence_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{e.excerpt}</p>
            {renderFeedback?.({
              entityType: 'evidence',
              entityId: e.evidence_id,
              existingRating: payload.feedback.find(
                (f) => f.entity_type === 'evidence' && f.entity_id === e.evidence_id
              )?.rating,
            })}
          </div>
        ))}
      </EntitySection>
      <EntitySection title="Positions" count={counts.positions}>
        {payload.positions.map((p) => (
          <div key={p.story_position_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{p.raw_text}</p>
            {renderFeedback?.({
              entityType: 'position',
              entityId: p.story_position_id,
              existingRating: payload.feedback.find(
                (f) => f.entity_type === 'position' && f.entity_id === p.story_position_id
              )?.rating,
            })}
          </div>
        ))}
      </EntitySection>
      <EntitySection title="Events" count={counts.events}>
        {payload.events.map((ev) => (
          <div key={ev.story_event_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{ev.event_summary}</p>
            {renderFeedback?.({
              entityType: 'event',
              entityId: ev.story_event_id,
              existingRating: payload.feedback.find(
                (f) => f.entity_type === 'event' && f.entity_id === ev.story_event_id
              )?.rating,
            })}
          </div>
        ))}
      </EntitySection>
      <LinksDetail payload={payload} compact />
    </div>
  )
}

function LinksDetail({
  payload,
  compact = false,
}: {
  payload: StoryExtractionReviewPayload
  compact?: boolean
}) {
  if (payload.story.merged_at == null) {
    return compact ? null : <EmptyDetail message="Links appear after merge." />
  }
  const { links } = payload
  const sections = [
    { title: 'Claim → Evidence', items: links.claimEvidence, fmt: (l: (typeof links.claimEvidence)[0]) => `${l.story_claim_id.slice(0, 8)}… → ${l.evidence_id.slice(0, 8)}… (${l.relation_type})` },
    { title: 'Claim → Position', items: links.claimPosition, fmt: (l: (typeof links.claimPosition)[0]) => `claim ${l.story_claim_id.slice(0, 8)}… ↔ position ${l.story_position_id.slice(0, 8)}…` },
    { title: 'Position → Evidence', items: links.positionEvidence, fmt: (l: (typeof links.positionEvidence)[0]) => `position ${l.story_position_id.slice(0, 8)}… ↔ evidence ${l.evidence_id.slice(0, 8)}…` },
    { title: 'Event → Claim', items: links.eventClaim, fmt: (l: (typeof links.eventClaim)[0]) => `event ${l.story_event_id.slice(0, 8)}… → claim ${l.story_claim_id.slice(0, 8)}… (${l.relation_type})` },
    { title: 'Event → Evidence', items: links.eventEvidence, fmt: (l: (typeof links.eventEvidence)[0]) => `event ${l.story_event_id.slice(0, 8)}… → evidence ${l.evidence_id.slice(0, 8)}…` },
  ]
  const hasAny = sections.some((s) => s.items.length > 0)
  if (!hasAny) return compact ? null : <EmptyDetail message="No entity links." />

  return (
    <div className={compact ? 'mt-3 space-y-2' : 'space-y-3'}>
      {!compact && <p className="text-xs font-medium">Entity links</p>}
      {compact && <p className="text-xs font-medium text-muted">Entity links</p>}
      {sections.map((s) =>
        s.items.length === 0 ? null : (
          <section key={s.title}>
            <p className="text-xs text-muted">{s.title}</p>
            <ul className="mt-0.5 space-y-0.5">
              {s.items.map((l, i) => (
                <li key={i} className="text-xs">
                  {s.fmt(l as never)}
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  )
}

function MergedQaDetail({
  payload,
  kind,
}: {
  payload: StoryExtractionReviewPayload
  kind: 'review' | 'refine' | 'validate'
}) {
  if (payload.story.merged_at == null) {
    return <EmptyDetail message="Not merged yet." />
  }

  const stage =
    kind === 'review' ? 'merge_review' : kind === 'refine' ? 'merge_refine' : 'merge_validate'
  const artifacts = payload.qa_artifacts.filter((a) => a.stage === stage)

  if (kind === 'review') {
    if (!payload.story.extraction_qa_review_report) {
      return <EmptyDetail message="No merge review output yet." />
    }
    return <ReportFindings report={payload.story.extraction_qa_review_report} />
  }

  if (kind === 'refine') {
    if ((payload.story.extraction_qa_refinement_count ?? 0) === 0 && artifacts.length === 0) {
      return <EmptyDetail message="No merge refine output yet." />
    }
    return (
      <div className="space-y-3">
        {(payload.story.extraction_qa_refinement_count ?? 0) > 0 && (
          <p className="text-xs text-muted">
            Refined {payload.story.extraction_qa_refinement_count}× · QA{' '}
            {qaStatusLabel(payload.story.extraction_qa_status)}
          </p>
        )}
        {artifacts[0]?.report ? (
          <div>
            <p className="mb-1 text-xs text-muted">Patches applied</p>
            <RefinePatches report={artifacts[0].report} />
          </div>
        ) : null}
        <div>
          <p className="mb-1 text-xs text-muted">Merged extraction after refine</p>
          <MergedEntitiesDetail payload={payload} />
        </div>
      </div>
    )
  }

  if (!payload.story.extraction_qa_validation_report) {
    return <EmptyDetail message="No merge validation output yet." />
  }
  return <ValidationSummary report={payload.story.extraction_qa_validation_report} />
}

function CanonicalLinksDetail({
  payload,
  entity,
}: {
  payload: StoryExtractionReviewPayload
  entity: 'claims' | 'events' | 'positions'
}) {
  if (payload.story.merged_at == null) {
    return <EmptyDetail message="Run merge first." />
  }

  if (entity === 'claims') {
    if (payload.claims.length === 0) return <EmptyDetail message="No claims." />
    return (
      <ul className="space-y-1.5">
        {payload.claims.map((c) => (
          <li key={c.story_claim_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{c.raw_text}</p>
            <p className="mt-1 text-muted">
              {c.claim_id ? `Canonical: ${c.claim_id}` : 'Not linked'}
            </p>
          </li>
        ))}
      </ul>
    )
  }

  if (entity === 'events') {
    if (payload.events.length === 0) return <EmptyDetail message="No events." />
    return (
      <ul className="space-y-1.5">
        {payload.events.map((e) => (
          <li key={e.story_event_id} className="rounded bg-muted/20 p-2 text-xs">
            <p>{e.event_summary}</p>
            <p className="mt-1 text-muted">{e.event_id ? `Canonical: ${e.event_id}` : 'Not linked'}</p>
          </li>
        ))}
      </ul>
    )
  }

  if (payload.positions.length === 0) return <EmptyDetail message="No positions." />
  return (
    <ul className="space-y-1.5">
      {payload.positions.map((p) => (
        <li key={p.story_position_id} className="rounded bg-muted/20 p-2 text-xs">
          <p>{p.raw_text}</p>
          <p className="mt-1 text-muted">
            {p.canonical_position_id ? `Canonical: ${p.canonical_position_id}` : 'Not linked'}
          </p>
        </li>
      ))}
    </ul>
  )
}

function StancesDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  if (payload.claims.length === 0) return <EmptyDetail message="No claims." />
  return (
    <ul className="space-y-1.5">
      {payload.claims.map((c) => (
        <li key={c.story_claim_id} className="rounded bg-muted/20 p-2 text-xs">
          <p>{c.raw_text}</p>
          <p className="mt-1 text-muted">
            Stance: {c.stance ?? '—'} · Polarity: {c.polarity}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function pipelineStepHasDetailContent(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  switch (stepId) {
    case 'chunk-story-bodies':
      return payload.chunks.length > 0
    case 'extract-story-entities':
      return payload.chunks.some((c) => c.extraction_json != null)
    case 'review-chunk-extraction':
      return payload.chunks.some(
        (c) => c.extraction_json != null && c.extraction_qa_review_report != null
      )
    case 'refine-chunk-extraction':
      return payload.chunks.some(
        (c) => c.extraction_json != null && (c.extraction_qa_refinement_count ?? 0) > 0
      )
    case 'validate-chunk-extraction':
      return payload.chunks.some(
        (c) => c.extraction_json != null && c.extraction_qa_validation_report != null
      )
    case 'merge-story-entities': {
      if (payload.story.merged_at == null) return false
      const counts = mergedEntityCounts(payload)
      return counts.claims + counts.evidence + counts.positions + counts.events > 0
    }
    case 'review-merged-extraction':
      return payload.story.merged_at != null && payload.story.extraction_qa_review_report != null
    case 'refine-merged-extraction':
      return (
        payload.story.merged_at != null &&
        ((payload.story.extraction_qa_refinement_count ?? 0) > 0 ||
          payload.qa_artifacts.some((a) => a.stage === 'merge_refine'))
      )
    case 'validate-merged-extraction':
      return payload.story.merged_at != null && payload.story.extraction_qa_validation_report != null
    case 'link-canonical-claims':
      return payload.story.merged_at != null && payload.claims.length > 0
    case 'link-canonical-events':
      return payload.story.merged_at != null && payload.events.length > 0
    case 'link-canonical-positions':
      return payload.story.merged_at != null && payload.positions.length > 0
    case 'update-stances':
      return payload.claims.length > 0
    default:
      return false
  }
}

export type PipelineStepDetailProps = {
  stepId: PipelineStepId
  payload: StoryExtractionReviewPayload
  reveal?: boolean
  revealKey?: number
  renderFeedback?: (props: {
    entityType: 'claim' | 'evidence' | 'position' | 'event'
    entityId: string
    existingRating?: string
  }) => ReactNode
}

export function PipelineStepDetail({
  stepId,
  payload,
  reveal = false,
  revealKey,
  renderFeedback,
}: PipelineStepDetailProps) {
  const content = (() => {
    switch (stepId) {
      case 'chunk-story-bodies':
        if (payload.chunks.length === 0) return <EmptyDetail message="No chunks yet." />
        return (
          <ul className="space-y-2">
            {payload.chunks.map((ch) => (
              <li key={ch.chunk_index} className="rounded border border-subtle p-2 text-xs">
                <p className="font-medium">Chunk {ch.chunk_index}</p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted">
                  {ch.content ?? '(empty)'}
                </p>
              </li>
            ))}
          </ul>
        )
      case 'extract-story-entities':
        return <ChunkExtractionsDetail payload={payload} />
      case 'review-chunk-extraction':
        return <ChunkQaDetail payload={payload} kind="review" />
      case 'refine-chunk-extraction':
        return <ChunkQaDetail payload={payload} kind="refine" />
      case 'validate-chunk-extraction':
        return <ChunkQaDetail payload={payload} kind="validate" />
      case 'merge-story-entities':
        return <MergedEntitiesDetail payload={payload} renderFeedback={renderFeedback} />
      case 'review-merged-extraction':
        return <MergedQaDetail payload={payload} kind="review" />
      case 'refine-merged-extraction':
        return <MergedQaDetail payload={payload} kind="refine" />
      case 'validate-merged-extraction':
        return <MergedQaDetail payload={payload} kind="validate" />
      case 'link-canonical-claims':
        return <CanonicalLinksDetail payload={payload} entity="claims" />
      case 'link-canonical-events':
        return <CanonicalLinksDetail payload={payload} entity="events" />
      case 'link-canonical-positions':
        return <CanonicalLinksDetail payload={payload} entity="positions" />
      case 'update-stances':
        return <StancesDetail payload={payload} />
      default:
        return null
    }
  })()

  if (!content || !reveal || !pipelineStepHasDetailContent(stepId, payload)) {
    return content
  }

  return (
    <StepDetailReveal key={revealKey} active>
      {content}
    </StepDetailReveal>
  )
}
