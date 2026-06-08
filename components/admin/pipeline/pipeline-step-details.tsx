'use client'

import type { ReactNode } from 'react'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { isIngestionStepExecuted } from '@/lib/admin/pipeline-status/ingestion'
import {
  getStepNotRequiredMessage,
  type PipelineStepId,
} from '@/lib/admin/story-pipeline-checklist'
import {
  chunkEntityCounts,
  flattenExtractionJson,
  mergedEntityCounts,
  resolvePostRefineExtractionJson,
  resolvePreRefineExtractionJson,
} from '@/lib/admin/chunk-extraction'
import { resolveArticleSpan, type ArticleSpan } from '@/lib/admin/article-span-highlight'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import {
  FocusAccordion,
  FocusAccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@/components/admin/pipeline/focus-accordion'
import { StepDetailReveal } from '@/components/admin/pipeline/step-detail-reveal'
import { RecordFieldRow, recordFieldGridClass } from '@/components/admin/record/record-field-row'

function formatChunkLabel(chunkIndex: number, totalChunks: number): string {
  return `Chunk ${chunkIndex + 1}/${totalChunks}`
}

export type SpanHighlightProps = {
  articleText: string | null
  chunks: StoryExtractionReviewPayload['chunks']
  onHighlightSpan: (span: ArticleSpan | null) => void
}

function claimHoverHandlers(
  spanHighlight: SpanHighlightProps | undefined,
  chunkIndex: number,
  spanStart: number | null,
  spanEnd: number | null,
  sourceExcerpt: string | null
) {
  if (!spanHighlight?.articleText) return {}
  return {
    onMouseEnter: () => {
      const span = resolveArticleSpan(spanHighlight.articleText!, spanHighlight.chunks, {
        chunkIndex,
        spanStart,
        spanEnd,
        sourceExcerpt,
      })
      spanHighlight.onHighlightSpan(span)
    },
    onMouseLeave: () => spanHighlight.onHighlightSpan(null),
  }
}

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

function StandardizationSummary({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return <EmptyDetail message="No standardization report." />
  const r = report as {
    kept?: unknown[]
    merged?: unknown[]
    reclassified?: unknown[]
    discarded?: unknown[]
    notes?: string[]
  }
  const sections = [
    { label: 'Kept', items: r.kept ?? [] },
    { label: 'Merged', items: r.merged ?? [] },
    { label: 'Reclassified', items: r.reclassified ?? [] },
    { label: 'Discarded', items: r.discarded ?? [] },
  ].filter((s) => s.items.length > 0)

  return (
    <div className="space-y-2 text-xs">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="font-medium text-muted">{section.label}</p>
          <ul className="mt-1 space-y-1">
            {section.items.map((item, i) => (
              <li key={i} className="rounded bg-muted/20 px-2 py-1.5">
                {typeof item === 'object' && item !== null && 'description' in item
                  ? String((item as { description?: string }).description ?? JSON.stringify(item))
                  : JSON.stringify(item)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {(r.notes?.length ?? 0) > 0 && (
        <ul className="space-y-1">
          {r.notes!.map((note, i) => (
            <li key={i} className="rounded bg-muted/20 px-2 py-1.5 text-muted">
              {note}
            </li>
          ))}
        </ul>
      )}
      {sections.length === 0 && (r.notes?.length ?? 0) === 0 && (
        <EmptyDetail message="No standardization changes recorded." />
      )}
    </div>
  )
}

function ValidationSummary({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const r = report as {
    passes?: boolean
    recommended_status?: string
    blocking_issues?: Array<string | { description?: string; acceptance_criteria?: string }>
    scores?: Record<string, number>
    attempt_number?: number
  }
  return (
    <div className="space-y-2 text-xs">
      {r.passes != null && (
        <p>
          Passes: <span className="font-medium">{r.passes ? 'Yes' : 'No'}</span>
          {r.recommended_status ? ` · ${r.recommended_status.replace(/_/g, ' ')}` : ''}
          {r.attempt_number ? ` · attempt ${r.attempt_number}` : ''}
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
              {typeof issue === 'string'
                ? issue
                : issue.acceptance_criteria || issue.description || JSON.stringify(issue)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function shouldShowPrimaryText(primary: string, triggerPreview: string): boolean {
  const normalized = primary.trim()
  if (!normalized) return false
  if (normalized === triggerPreview.trim()) return false
  if (triggerPreview.endsWith('…')) {
    const prefix = triggerPreview.slice(0, -1).trimEnd()
    return normalized.startsWith(prefix)
  }
  return normalized !== triggerPreview.trim()
}

function EntityMetadataLine({ fields }: { fields: Array<{ label: string; value: string | null }> }) {
  const visible = fields.filter((field) => field.value)
  if (visible.length === 0) return null
  return (
    <p className="text-xs text-muted">
      {visible.map((field, index) => (
        <span key={field.label}>
          {index > 0 && ' · '}
          <span className="font-medium text-foreground/80">{field.label}:</span> {field.value}
        </span>
      ))}
    </p>
  )
}

function EntityExpandedDetail({
  primaryText,
  triggerText,
  metadata,
  footnotes = [],
}: {
  primaryText: string | null
  triggerText: string
  metadata: Array<{ label: string; value: string | null }>
  footnotes?: Array<{ label: string; value: string | null }>
}) {
  const primary = primaryText?.trim() ?? ''
  const showPrimary = shouldShowPrimaryText(primary, triggerText)
  const visibleFootnotes = footnotes.filter(
    (field) => field.value && field.value.trim() !== primary && field.value.trim() !== triggerText.trim()
  )
  const hasMetadata = metadata.some((field) => field.value)

  if (!hasMetadata && !showPrimary && visibleFootnotes.length === 0) {
    return <p className="text-xs text-muted">No additional details.</p>
  }

  return (
    <div className="space-y-1">
      <EntityMetadataLine fields={metadata} />
      {showPrimary && <p className="text-xs whitespace-pre-wrap">{primary}</p>}
      {visibleFootnotes.map((field) => (
        <p key={field.label} className="text-xs text-muted">
          <span className="font-medium text-foreground/80">{field.label}:</span> {field.value}
        </p>
      ))}
    </div>
  )
}

function confidenceValue(value: number | null): string | null {
  return value != null ? String(value) : null
}

function buildEntityExpandedContent({
  primaryText,
  triggerText,
  metadata,
  footnotes = [],
}: {
  primaryText: string | null
  triggerText: string
  metadata: Array<{ label: string; value: string | null }>
  footnotes?: Array<{ label: string; value: string | null }>
}) {
  return (
    <EntityExpandedDetail
      primaryText={primaryText}
      triggerText={triggerText}
      metadata={metadata}
      footnotes={footnotes}
    />
  )
}

function ChunkEntityNestedAccordion({
  chunkIndex,
  extractionJson,
  spanHighlight,
}: {
  chunkIndex: number
  extractionJson: unknown
  spanHighlight?: SpanHighlightProps
}) {
  const counts = chunkEntityCounts(extractionJson)
  const flat = flattenExtractionJson(chunkIndex, extractionJson)

  const categories: Array<{
    id: string
    title: string
    count: number
    items: Array<{
      id: string
      trigger: string
      content: ReactNode
    }>
  }> = [
    {
      id: 'claims',
      title: 'Claims',
      count: counts.claims,
      items: flat.claims.map((claim) => {
        const trigger = claim.raw_text.trim()
        return {
          id: `claim-${claim.index}`,
          trigger,
          content: buildEntityExpandedContent({
            primaryText: claim.raw_text,
            triggerText: trigger,
            metadata: [
              { label: 'Polarity', value: claim.polarity },
              { label: 'Stance', value: claim.stance },
              { label: 'Confidence', value: confidenceValue(claim.extraction_confidence) },
            ],
          }),
        }
      }),
    },
    {
      id: 'evidence',
      title: 'Evidence',
      count: counts.evidence,
      items: flat.evidence.map((item) => {
        const trigger = item.excerpt.trim()
        return {
          id: `evidence-${item.index}`,
          trigger,
          content: buildEntityExpandedContent({
            primaryText: item.excerpt,
            triggerText: trigger,
            metadata: [
              { label: 'Type', value: item.evidence_type },
              { label: 'Attribution', value: item.attribution },
              { label: 'Confidence', value: confidenceValue(item.extraction_confidence) },
            ],
          }),
        }
      }),
    },
    {
      id: 'positions',
      title: 'Positions',
      count: counts.positions,
      items: flat.positions.map((item) => {
        const trigger = item.raw_text.trim()
        return {
          id: `position-${item.index}`,
          trigger,
          content: buildEntityExpandedContent({
            primaryText: item.raw_text,
            triggerText: trigger,
            metadata: [
              { label: 'Speaker type', value: item.speaker_type },
              { label: 'Position type', value: item.position_type },
              { label: 'Holder', value: item.holder },
              { label: 'Confidence', value: confidenceValue(item.extraction_confidence) },
            ],
            footnotes: [{ label: 'Excerpt', value: item.excerpt_text }],
          }),
        }
      }),
    },
    {
      id: 'events',
      title: 'Events',
      count: counts.events,
      items: flat.events.map((item) => {
        const trigger = item.event_summary.trim()
        return {
          id: `event-${item.index}`,
          trigger,
          content: buildEntityExpandedContent({
            primaryText: item.event_summary,
            triggerText: trigger,
            metadata: [
              { label: 'Type', value: item.event_type },
              { label: 'Primary actor', value: item.primary_actor },
              { label: 'Confidence', value: confidenceValue(item.extraction_confidence) },
            ],
          }),
        }
      }),
    },
  ].filter((category) => category.count > 0)

  if (categories.length === 0) {
    return <EmptyDetail message="No extracted entities in this chunk." />
  }

  return (
    <FocusAccordion className="space-y-2">
      {categories.map((category) => (
        <FocusAccordionItem
          key={category.id}
          value={`${chunkIndex}-${category.id}`}
          className="rounded border border-subtle px-2"
        >
          <AccordionTrigger className="py-2 text-xs font-medium hover:no-underline">
            {category.title} ({category.count})
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <FocusAccordion className="space-y-1">
              {category.items.map((item, itemIndex) => {
                const claim =
                  category.id === 'claims'
                    ? flat.claims[itemIndex]
                    : null

                return (
                  <FocusAccordionItem
                    key={item.id}
                    value={`${chunkIndex}-${item.id}`}
                    className="px-0"
                  >
                    <AccordionTrigger
                      className="py-1.5 text-xs font-normal hover:no-underline"
                      {...(claim
                        ? claimHoverHandlers(
                            spanHighlight,
                            chunkIndex,
                            claim.span_start,
                            claim.span_end,
                            claim.source_excerpt
                          )
                        : {})}
                    >
                      <span className="min-w-0 flex-1 text-left whitespace-pre-wrap">{item.trigger}</span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 pt-0">{item.content}</AccordionContent>
                  </FocusAccordionItem>
                )
              })}
            </FocusAccordion>
          </AccordionContent>
        </FocusAccordionItem>
      ))}
    </FocusAccordion>
  )
}

function ChunkEntityList({
  chunkIndex,
  extractionJson,
  spanHighlight,
}: {
  chunkIndex: number
  extractionJson: unknown
  spanHighlight?: SpanHighlightProps
}) {
  const counts = chunkEntityCounts(extractionJson)
  const flat = flattenExtractionJson(chunkIndex, extractionJson)
  return (
    <>
      <EntitySection title="Claims" count={counts.claims}>
        {flat.claims.map((c) => (
          <p
            key={c.index}
            className="cursor-default rounded bg-muted/20 p-2 text-xs transition-shadow hover:ring-1 hover:ring-accent-primary/40"
            {...claimHoverHandlers(
              spanHighlight,
              chunkIndex,
              c.span_start,
              c.span_end,
              c.source_excerpt
            )}
          >
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

function ChunkExtractionsDetail({
  payload,
  spanHighlight,
}: {
  payload: StoryExtractionReviewPayload
  spanHighlight?: SpanHighlightProps
}) {
  if (payload.chunks.length === 0) {
    return <EmptyDetail message="No chunks yet." />
  }
  const extracted = payload.chunks.filter((c) => c.extraction_json != null)
  if (extracted.length === 0) {
    return <EmptyDetail message="No chunk extractions yet." />
  }

  return (
    <FocusAccordion className="space-y-2">
      {extracted.map((ch) => {
        const extractionJson = resolvePreRefineExtractionJson(ch, payload.qa_artifacts)
        return (
          <FocusAccordionItem
            key={ch.chunk_index}
            value={`chunk-${ch.chunk_index}`}
            className="rounded border border-subtle px-2"
          >
            <AccordionTrigger className="py-2 text-xs font-medium hover:no-underline">
              {formatChunkLabel(ch.chunk_index, payload.chunks.length)}
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <ChunkEntityNestedAccordion
                chunkIndex={ch.chunk_index}
                extractionJson={extractionJson}
                spanHighlight={spanHighlight}
              />
            </AccordionContent>
          </FocusAccordionItem>
        )
      })}
    </FocusAccordion>
  )
}

function ChunkQaDetail({
  payload,
  kind,
  spanHighlight,
}: {
  payload: StoryExtractionReviewPayload
  kind: 'standardize' | 'refine' | 'validate'
  spanHighlight?: SpanHighlightProps
}) {
  const chunks = payload.chunks.filter((c) => c.extraction_json != null)
  if (chunks.length === 0) return <EmptyDetail message="No chunks to show." />

  const reportKey =
    kind === 'validate' ? 'extraction_qa_validation_report' : 'extraction_qa_standardization_report'
  const stage =
    kind === 'standardize' ? 'chunk_standardize' : kind === 'refine' ? 'chunk_refine' : 'chunk_validate'

  const relevant = chunks.filter((c) => {
    if (kind === 'refine') return (c.extraction_qa_refinement_count ?? 0) > 0
    if (kind === 'validate') return c.extraction_qa_validation_report != null
    return c.extraction_qa_standardization_report != null
  })

  if (relevant.length === 0) {
    if (kind === 'validate') {
      const notRequired = getStepNotRequiredMessage('validate-chunk-claims', payload)
      if (notRequired) return <EmptyDetail message={notRequired} />
    }
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
              {formatChunkLabel(ch.chunk_index, payload.chunks.length)} ·{' '}
              {qaStatusLabel(ch.extraction_qa_status)}
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
                    spanHighlight={spanHighlight}
                  />
                </div>
              </>
            ) : kind === 'validate' ? (
              <div className="mt-2">
                <ValidationSummary report={ch[reportKey]} />
              </div>
            ) : (
              <div className="mt-2">
                <StandardizationSummary report={ch.extraction_qa_standardization_report} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function MergedEntitiesDetail({
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
    const notRequired = getStepNotRequiredMessage('refine-merged-extraction', payload)
    if (notRequired) return <EmptyDetail message={notRequired} />
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
    const notRequired = getStepNotRequiredMessage('link-canonical-claims', payload)
    if (payload.claims.length === 0) {
      return <EmptyDetail message={notRequired ?? 'No claims.'} />
    }
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
    const notRequired = getStepNotRequiredMessage('link-canonical-events', payload)
    if (payload.events.length === 0) {
      return <EmptyDetail message={notRequired ?? 'No events.'} />
    }
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

  const notRequired = getStepNotRequiredMessage('link-canonical-positions', payload)
  if (payload.positions.length === 0) {
    return <EmptyDetail message={notRequired ?? 'No positions.'} />
  }
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
  const notRequired = getStepNotRequiredMessage('update-stances', payload)
  if (payload.claims.length === 0) {
    return <EmptyDetail message={notRequired ?? 'No claims.'} />
  }
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

function formatIngestionDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function StepMetadata({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className={recordFieldGridClass}>
      {rows.map(({ label, value }) => (
        <RecordFieldRow key={label} label={label}>
          {value}
        </RecordFieldRow>
      ))}
    </dl>
  )
}

function RelevanceGateDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  const { story } = payload
  const executed = isIngestionStepExecuted('relevance-gate', payload)
  const tags = executed ? (story.relevance_tags?.filter(Boolean) ?? []) : []

  return (
    <StepMetadata
      rows={[
        {
          label: 'Qualification status',
          value: executed ? story.relevance_status : null,
        },
        {
          label: 'Relevance score',
          value: executed ? story.relevance_score : null,
        },
        {
          label: 'Qualify ran',
          value: executed ? formatIngestionDate(story.relevance_ran_at) : null,
        },
        ...(tags.length > 0
          ? [{ label: 'Relevance tags', value: tags.join(', ') }]
          : []),
      ]}
    />
  )
}

function ReviewPendingDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  const { story } = payload
  const notRequired = getStepNotRequiredMessage('review-pending-stories', payload)
  const executed = isIngestionStepExecuted('review-pending-stories', payload)

  return (
    <div className="space-y-2">
      {notRequired && <p className="text-xs text-muted">{notRequired}</p>}
      <StepMetadata
        rows={[
          {
            label: 'Qualification status',
            value: executed ? story.relevance_status : null,
          },
          {
            label: 'Pending review ran',
            value: executed ? formatIngestionDate(story.pending_review_ran_at) : null,
          },
          {
            label: 'Awaiting resolution',
            value: executed
              ? story.relevance_status === 'PENDING'
                ? 'Yes'
                : 'No'
              : null,
          },
        ]}
      />
    </div>
  )
}

function ScrapeStoryDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  const { story } = payload
  const executed = isIngestionStepExecuted('scrape-story-content', payload)

  return (
    <StepMetadata
      rows={[
        {
          label: 'Scraped',
          value: executed ? formatIngestionDate(story.scraped_at) : null,
        },
        {
          label: 'Scrape dispatched',
          value: executed ? formatIngestionDate(story.scrape_dispatched_at) : null,
        },
        {
          label: 'Scrape skipped',
          value: executed ? (story.scrape_skipped ? 'Yes' : 'No') : null,
        },
        {
          label: 'Scrape failures',
          value:
            executed && story.scrape_fail_count > 0 ? story.scrape_fail_count : null,
        },
      ]}
    />
  )
}

function CleanScrapedDetail({ payload }: { payload: StoryExtractionReviewPayload }) {
  const { story } = payload
  const executed = isIngestionStepExecuted('clean-scraped-content', payload)
  const articleLength =
    story.content_length_clean ?? (story.has_content_clean ? story.article_text?.length : null)

  return (
    <StepMetadata
      rows={[
        {
          label: 'Clean body',
          value: executed ? (story.has_content_clean ? 'Ready' : 'Not ready') : null,
        },
        {
          label: 'Article length',
          value:
            executed && articleLength != null && articleLength > 0
              ? `${articleLength.toLocaleString()} characters`
              : null,
        },
        {
          label: 'Cleaned',
          value: executed ? formatIngestionDate(story.cleaned_at) : null,
        },
      ]}
    />
  )
}

export function pipelineStepHasDetailContent(
  stepId: PipelineStepId,
  payload: StoryExtractionReviewPayload
): boolean {
  switch (stepId) {
    case 'relevance-gate':
      return isIngestionStepExecuted('relevance-gate', payload)
    case 'review-pending-stories':
      return (
        isIngestionStepExecuted('review-pending-stories', payload) ||
        getStepNotRequiredMessage(stepId, payload) != null
      )
    case 'scrape-story-content':
      return isIngestionStepExecuted('scrape-story-content', payload)
    case 'clean-scraped-content':
      return isIngestionStepExecuted('clean-scraped-content', payload)
    case 'chunk-story-bodies':
      return payload.chunks.length > 0
    case 'extract-story-claims':
      return payload.chunks.some((c) => c.extraction_json != null)
    case 'validate-chunk-claims':
      return payload.chunks.some(
        (c) => c.extraction_json != null && c.extraction_qa_validation_report != null
      )
    case 'merge-story-claims': {
      if (payload.story.merged_at == null) return false
      return payload.claims.length > 0
    }
    case 'review-merged-extraction':
      return payload.story.merged_at != null && payload.story.extraction_qa_review_report != null
    case 'refine-merged-extraction':
      return (
        getStepNotRequiredMessage('refine-merged-extraction', payload) != null ||
        (payload.story.merged_at != null &&
          ((payload.story.extraction_qa_refinement_count ?? 0) > 0 ||
            payload.qa_artifacts.some((a) => a.stage === 'merge_refine')))
      )
    case 'validate-merged-extraction':
      return payload.story.merged_at != null && payload.story.extraction_qa_validation_report != null
    case 'link-canonical-claims':
      return (
        payload.story.merged_at != null &&
        (payload.claims.length > 0 ||
          getStepNotRequiredMessage('link-canonical-claims', payload) != null)
      )
    case 'link-canonical-events':
      return (
        payload.story.merged_at != null &&
        (payload.events.length > 0 ||
          getStepNotRequiredMessage('link-canonical-events', payload) != null)
      )
    case 'link-canonical-positions':
      return (
        payload.story.merged_at != null &&
        (payload.positions.length > 0 ||
          getStepNotRequiredMessage('link-canonical-positions', payload) != null)
      )
    case 'update-stances':
      return (
        payload.claims.length > 0 || getStepNotRequiredMessage('update-stances', payload) != null
      )
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
  spanHighlight?: SpanHighlightProps
}

export function PipelineStepDetail({
  stepId,
  payload,
  reveal = false,
  revealKey,
  renderFeedback,
  spanHighlight,
}: PipelineStepDetailProps) {
  const content = (() => {
    switch (stepId) {
      case 'relevance-gate':
        return <RelevanceGateDetail payload={payload} />
      case 'review-pending-stories':
        return <ReviewPendingDetail payload={payload} />
      case 'scrape-story-content':
        return <ScrapeStoryDetail payload={payload} />
      case 'clean-scraped-content':
        return <CleanScrapedDetail payload={payload} />
      case 'chunk-story-bodies':
        if (payload.chunks.length === 0) return <EmptyDetail message="No chunks yet." />
        return (
          <ul className="space-y-1 text-xs">
            {payload.chunks.map((ch) => {
              const charCount = (ch.content ?? '').length
              return (
                <li
                  key={ch.chunk_index}
                  className="flex items-baseline justify-between gap-3 rounded border border-subtle px-2 py-1.5"
                >
                  <span className="font-medium">
                    {formatChunkLabel(ch.chunk_index, payload.chunks.length)}
                  </span>
                  <span className="shrink-0 text-muted">
                    {charCount.toLocaleString()} {charCount === 1 ? 'character' : 'characters'}
                  </span>
                </li>
              )
            })}
          </ul>
        )
      case 'extract-story-claims':
        return <ChunkExtractionsDetail payload={payload} spanHighlight={spanHighlight} />
      case 'validate-chunk-claims':
        return <ChunkQaDetail payload={payload} kind="validate" spanHighlight={spanHighlight} />
      case 'merge-story-claims':
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
