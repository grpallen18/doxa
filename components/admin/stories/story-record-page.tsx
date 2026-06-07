'use client'

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HighlightedArticleText } from '@/components/admin/highlighted-article-text'
import { ClearCanonicalButton } from '@/components/admin/pipeline/clear-canonical-button'
import { ClearExtractionButton } from '@/components/admin/pipeline/clear-extraction-button'
import { PipelineChecklist } from '@/components/admin/pipeline/pipeline-checklist'
import { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { StoryExtractionExportButtons } from '@/components/admin/stories/story-extraction-export-buttons'
import { StoryFeedbackButtons } from '@/components/admin/stories/story-feedback-buttons'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { StoryAnchorScroll } from '@/components/admin/stories/story-anchor-scroll'
import { AtomList } from '@/components/admin/record/atom-list'
import { AuditTimeline } from '@/components/admin/record/audit-timeline'
import { EntityHeader } from '@/components/admin/record/entity-header'
import { JsonMarkdownViewer } from '@/components/admin/record/json-markdown-viewer'
import { LifecyclePath } from '@/components/admin/record/lifecycle-path'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import { RelationshipPanel } from '@/components/admin/record/relationship-panel'
import { StatusBadge } from '@/components/admin/record/status-badge'
import { ConfidenceBadge } from '@/components/admin/record/confidence-badge'
import type { ArticleSpan } from '@/lib/admin/article-span-highlight'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import {
  getNextRunnableLifecycleStep,
  POST_MERGE_STEP_IDS,
  STORY_LIFECYCLE_STEP_IDS,
} from '@/lib/admin/story-lifecycle'
import {
  getRevertibleStepId,
  getRevertBlockedReason,
} from '@/lib/admin/story-pipeline-checklist'
import {
  buildExtractionReviewJson,
  buildExtractionReviewMarkdown,
} from '@/lib/admin/story-extraction-review'
import { buildStoryAuditFromPayload, type StoryAuditEvent } from '@/lib/admin/story-audit'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export function StoryRecordPage() {
  const { storyId, payload, refresh } = useStoryReview()

  if (!payload) return null

  return (
    <StoryRecordPageContent
      storyId={storyId}
      payload={payload}
      refresh={refresh}
    />
  )
}

function StoryRecordPageContent({
  storyId,
  payload,
  refresh,
}: {
  storyId: string
  payload: NonNullable<ReturnType<typeof useStoryReview>['payload']>
  refresh: (silent?: boolean) => Promise<void>
}) {
  const [approving, setApproving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [highlightSpan, setHighlightSpan] = useState<ArticleSpan | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [auditEvents, setAuditEvents] = useState<StoryAuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const pipelineActions = useStoryPipelineActions({
    storyId,
    payload,
    onRefresh: async () => refresh(true),
  })

  const revertibleStepId = useMemo(() => getRevertibleStepId(payload), [payload])
  const revertBlockedReason = useMemo(() => getRevertBlockedReason(payload), [payload])
  const nextStepId = useMemo(() => getNextRunnableLifecycleStep(payload), [payload])

  const approveQa = useCallback(async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/admin/stories/${storyId}/qa-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_chunks: true }),
      })
      if (res.ok) await refresh(true)
    } finally {
      setApproving(false)
    }
  }, [storyId, refresh])

  useEffect(() => {
    setAuditLoading(true)
    fetch(`/api/admin/stories/${storyId}/audit`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json.data?.events) {
          setAuditEvents(json.data.events)
        } else {
          setAuditEvents(buildStoryAuditFromPayload(payload))
        }
      })
      .catch(() => setAuditEvents(buildStoryAuditFromPayload(payload)))
      .finally(() => setAuditLoading(false))
  }, [storyId, payload])

  const { story } = payload
  const markdown = buildExtractionReviewMarkdown(payload)
  const json = buildExtractionReviewJson(payload)

  const handleSectionVisible = (sectionId: string) => {
    setOpenSection(sectionId)
  }

  const runNext = () => {
    if (nextStepId) void pipelineActions.runStep(nextStepId)
  }

  const revertLast = () => {
    if (revertibleStepId) pipelineActions.requestRevert(revertibleStepId)
  }

  const headerActions = (
    <>
      <Button
        type="button"
        size="sm"
        disabled={!nextStepId || pipelineActions.isBusy}
        onClick={runNext}
      >
        {pipelineActions.isBusy && nextStepId ? (
          <>
            <Loader2 className="mr-1 size-3 animate-spin" />
            Running…
          </>
        ) : (
          'Run next step'
        )}
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!revertibleStepId || pipelineActions.isBusy}
                onClick={revertLast}
              >
                Revert last step
              </Button>
            </span>
          </TooltipTrigger>
          {(revertBlockedReason || !revertibleStepId) && (
            <TooltipContent>
              {revertBlockedReason ??
                'No revertible step. Revert is only available through chunk validation.'}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
      <ClearExtractionButton
        storyId={storyId}
        disabled={pipelineActions.isBusy}
        onCleared={async () => refresh(true)}
        onError={setActionError}
      />
      <StoryExtractionExportButtons payload={payload} storyId={storyId} />
    </>
  )

  const feedbackRenderer: NonNullable<
    ComponentProps<typeof PipelineChecklist>['renderFeedback']
  > = ({ entityType, entityId, existingRating }) => (
    <StoryFeedbackButtons
      storyId={storyId}
      entityType={entityType}
      entityId={entityId}
      existingRating={existingRating}
      onSubmitted={() => void refresh(true)}
    />
  )

  const spanHighlight = {
    articleText: story.article_text,
    chunks: payload.chunks,
    onHighlightSpan: setHighlightSpan,
  }

  return (
    <div className="space-y-4 p-4">
      <StoryAnchorScroll onSectionVisible={handleSectionVisible} />

      <EntityHeader
        title={story.title}
        subtitle={story.source_name ?? 'Unknown source'}
        meta={[
          { label: 'Author', value: story.author ?? '—' },
          { label: 'Published', value: formatDate(story.published_at) },
          { label: 'Ingested', value: formatDate(story.fetched_at) },
          { label: 'Story ID', value: <span className="font-mono text-[11px]">{story.story_id}</span> },
          {
            label: 'Extraction status',
            value: <StatusBadge label={story.extraction_status} variant="default" />,
          },
          {
            label: 'Relevance',
            value: story.relevance_status ?? '—',
          },
          {
            label: 'QA status',
            value: <StatusBadge label={qaStatusLabel(story.extraction_qa_status)} variant="warning" />,
          },
        ]}
        actions={headerActions}
      />

      {actionError && <p className="text-xs text-destructive">{actionError}</p>}

      <LifecyclePath
        payload={payload}
        runningStepId={pipelineActions.runningStepId}
        onStepSelect={(stepId) => {
          const el = document.getElementById(`step-${stepId}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          pipelineActions.setExpanded((prev) =>
            prev.includes(stepId) ? prev : [...prev, stepId]
          )
        }}
      />

      <RecordSectionCard
        id="story-info"
        title="Story info"
        forceOpen={openSection === 'story-info'}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">URL</dt>
            <dd className="mt-0.5">
              <a
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-primary hover:underline break-all"
              >
                {story.url}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Relevance score</dt>
            <dd className="mt-0.5">{story.relevance_score ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Scrape failures</dt>
            <dd className="mt-0.5">{story.scrape_fail_count}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Content clean</dt>
            <dd className="mt-0.5">{story.has_content_clean ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </RecordSectionCard>

      <RecordSectionCard
        id="source-content"
        title="Source content"
        description="Article text with span highlight from extracted atoms."
        forceOpen={openSection === 'source-content'}
      >
        <ScrollArea className="max-h-[480px] rounded-md border border-subtle p-4">
          <article className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed dark:prose-invert">
            {story.article_text ? (
              <HighlightedArticleText text={story.article_text} highlight={highlightSpan} />
            ) : (
              <p className="text-muted italic">No article text available.</p>
            )}
          </article>
        </ScrollArea>
        {payload.chunks.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {payload.chunks.length} chunk{payload.chunks.length === 1 ? '' : 's'} after chunking.
          </p>
        )}
      </RecordSectionCard>

      <RecordSectionCard
        id="extracted-atoms"
        title="Extracted atoms"
        description="Story-local atoms before canonical merge."
        forceOpen={openSection === 'extracted-atoms'}
      >
        <AtomList
          payload={payload}
          articleText={story.article_text}
          onHighlightSpan={setHighlightSpan}
        />
        <div className="mt-4 border-t border-subtle pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Relationships
          </h3>
          <div className="mt-2">
            <RelationshipPanel payload={payload} />
          </div>
        </div>
      </RecordSectionCard>

      <RecordSectionCard
        id="agent-outputs"
        title="Agent stage outputs"
        description="Runnable lifecycle steps through merge."
        forceOpen={openSection === 'agent-outputs' || openSection?.startsWith('step-') === true}
      >
        <PipelineChecklist
          payload={payload}
          storyId={storyId}
          stepIds={STORY_LIFECYCLE_STEP_IDS}
          onRefresh={async () => refresh(true)}
          onApproveQa={approveQa}
          approvingQa={approving}
          pipelineActions={pipelineActions}
          renderFeedback={feedbackRenderer}
          spanHighlight={spanHighlight}
          title="Lifecycle steps"
          description="Run, revert, and inspect outputs for ingestion through merge QA."
          showRevertBlockedNotice={false}
        />
      </RecordSectionCard>

      <RecordSectionCard
        id="validation-review"
        title="Validation and review"
        forceOpen={openSection === 'validation-review'}
      >
        <div className="space-y-3 text-sm">
          <p>
            QA status:{' '}
            <StatusBadge label={qaStatusLabel(story.extraction_qa_status)} variant="warning" />
          </p>
          {story.extraction_qa_refinement_count > 0 && (
            <p className="text-xs text-muted">
              Merge refinement cycles: {story.extraction_qa_refinement_count}
            </p>
          )}
          {story.extraction_qa_status === 'needs_human_review' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={approving}
              onClick={() => void approveQa()}
            >
              {approving ? 'Approving…' : 'Approve QA'}
            </Button>
          )}
          <JsonMarkdownViewer
            markdown={
              story.extraction_qa_review_report
                ? JSON.stringify(story.extraction_qa_review_report, null, 2)
                : undefined
            }
            json={
              story.extraction_qa_validation_report
                ? JSON.stringify(story.extraction_qa_validation_report, null, 2)
                : undefined
            }
            defaultMode="json"
          />
        </div>
      </RecordSectionCard>

      <RecordSectionCard
        id="merge-results"
        title="Merge results"
        description="Story atoms linked to canonical records where applicable."
        forceOpen={openSection === 'merge-results'}
      >
        <div className="space-y-3 text-sm">
          {payload.claims.map((c) => (
            <div key={c.story_claim_id} className="rounded-md border border-subtle px-3 py-2">
              <p>{c.raw_text}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <ConfidenceBadge value={c.extraction_confidence} />
                {c.claim_id ? (
                  <Link
                    href={`/admin/records/claims/${c.claim_id}`}
                    className="text-accent-primary hover:underline"
                  >
                    Canonical claim {c.claim_id.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-muted">Not linked to canonical</span>
                )}
              </div>
            </div>
          ))}
          {payload.positions
            .filter((p) => p.canonical_position_id)
            .map((p) => (
              <div key={p.story_position_id} className="rounded-md border border-subtle px-3 py-2">
                <p>{p.raw_text}</p>
                <Link
                  href={`/admin/records/positions/${p.canonical_position_id}`}
                  className="mt-1 inline-block text-xs text-accent-primary hover:underline"
                >
                  Canonical position
                </Link>
              </div>
            ))}
          {payload.events
            .filter((e) => e.event_id)
            .map((e) => (
              <div key={e.story_event_id} className="rounded-md border border-subtle px-3 py-2">
                <p>{e.event_summary}</p>
                <Link
                  href={`/admin/records/events/${e.event_id}`}
                  className="mt-1 inline-block text-xs text-accent-primary hover:underline"
                >
                  Canonical event
                </Link>
              </div>
            ))}
          {payload.claims.length === 0 && (
            <p className="text-xs text-muted">No merged claims yet.</p>
          )}
        </div>
      </RecordSectionCard>

      <RecordSectionCard
        id="post-merge-actions"
        title="Post-merge actions"
        description="Story-scoped canonical linkers. Not part of the story lifecycle path."
        forceOpen={openSection === 'post-merge-actions'}
      >
        <PipelineChecklist
          payload={payload}
          storyId={storyId}
          stepIds={POST_MERGE_STEP_IDS}
          onRefresh={async () => refresh(true)}
          onApproveQa={approveQa}
          approvingQa={approving}
          pipelineActions={pipelineActions}
          renderFeedback={feedbackRenderer}
          spanHighlight={spanHighlight}
          title="Canonical linkers"
          description="Link story entities to global canonical rows and backfill stances."
          showBlockedBanner={false}
          toolbarActions={
            <ClearCanonicalButton
              storyId={storyId}
              onCleared={async () => refresh(true)}
              onError={setActionError}
            />
          }
        />
      </RecordSectionCard>

      <RecordSectionCard
        id="audit-history"
        title="Audit history"
        description="Best-effort timeline from status fields, pipeline runs, and feedback."
        forceOpen={openSection === 'audit-history'}
      >
        {auditLoading ? (
          <p className="text-xs text-muted">Loading audit events…</p>
        ) : (
          <AuditTimeline events={auditEvents} />
        )}
      </RecordSectionCard>
    </div>
  )
}
