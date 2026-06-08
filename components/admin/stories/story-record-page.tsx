'use client'

import { useCallback, useMemo, useState, type ComponentProps } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ClearCanonicalButton } from '@/components/admin/pipeline/clear-canonical-button'
import { ClearExtractionButton } from '@/components/admin/pipeline/clear-extraction-button'
import { PipelineChecklist } from '@/components/admin/pipeline/pipeline-checklist'
import { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { StoryExtractionExportButtons } from '@/components/admin/stories/story-extraction-export-buttons'
import { StoryFeedbackButtons } from '@/components/admin/stories/story-feedback-buttons'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { StoryAnchorScroll } from '@/components/admin/stories/story-anchor-scroll'
import { EntityHeader } from '@/components/admin/record/entity-header'
import { RecordAuditSection } from '@/components/admin/record/record-audit-section'
import { RecordEntityLinkBar } from '@/components/admin/record/record-entity-link-bar'
import { RecordFieldGrid } from '@/components/admin/record/record-field-grid'
import { LifecyclePath } from '@/components/admin/record/lifecycle-path'
import { StoryInfoLayout } from '@/components/admin/stories/story-info-layout'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import type { ArticleSpan } from '@/lib/admin/article-span-highlight'
import {
  chunkSectionFields,
  extractedAtomsSectionFields,
  mergeResultsSectionFields,
  postMergeSectionFields,
  validationReviewSectionFields,
} from '@/lib/admin/story-record-section-fields'
import {
  getNextRunnableLifecycleStep,
  POST_MERGE_STEP_IDS,
} from '@/lib/admin/story-lifecycle'
import {
  getRevertibleStepId,
  getRevertBlockedReason,
} from '@/lib/admin/story-pipeline-checklist'
import { ChunksTable } from '@/components/admin/stories/chunks-table'
import { StoryLifecycleSteps } from '@/components/admin/stories/story-lifecycle-steps'
import { showPipelineError } from '@/lib/admin/pipeline-toast'
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
  const [highlightSpan, setHighlightSpan] = useState<ArticleSpan | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)

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

  const { story } = payload

  const handleSectionVisible = useCallback((sectionId: string) => {
    setOpenSection(sectionId)
  }, [])

  const runNext = () => {
    if (nextStepId) void pipelineActions.runStep(nextStepId)
  }

  const revertLast = () => {
    if (revertibleStepId) pipelineActions.requestRevert(revertibleStepId)
  }

  const pipelineToolbar = (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={!nextStepId || pipelineActions.isBusy}
          onClick={runNext}
        >
          {pipelineActions.isBusy && nextStepId ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              Running…
            </>
          ) : (
            'Run'
          )}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={!revertibleStepId || pipelineActions.isBusy}
                onClick={revertLast}
              >
                Revert
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
        <StoryExtractionExportButtons payload={payload} compact />
        <ClearExtractionButton
          storyId={storyId}
          compact
          disabled={pipelineActions.isBusy}
          onCleared={async () => refresh(true)}
          onError={showPipelineError}
        />
      </div>
    </TooltipProvider>
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

  const chunkFields = useMemo(() => chunkSectionFields(payload), [payload])
  const extractedAtomsFields = useMemo(
    () => extractedAtomsSectionFields(payload),
    [payload]
  )
  const validationFields = useMemo(
    () => validationReviewSectionFields(payload),
    [payload]
  )
  const mergeResultsFields = useMemo(
    () => mergeResultsSectionFields(payload),
    [payload]
  )
  const postMergeFields = useMemo(() => postMergeSectionFields(payload), [payload])

  return (
    <div className="w-full -mx-4 bg-surface px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
      <StoryAnchorScroll onSectionVisible={handleSectionVisible} />

      <div>
      <RecordEntityLinkBar
        links={[
          {
            label: 'Story URL',
            linkText: 'URL',
            href: story.url,
          },
          {
            label: 'Source',
            linkText: story.source_name ?? 'Unknown',
            href: story.url,
          },
        ]}
      />
      <EntityHeader layout="record" embedded title={story.title} />

      <LifecyclePath
        payload={payload}
        runningStepId={pipelineActions.runningStepId}
        onStepSelect={(stepId) => {
          pipelineActions.setExpanded((prev) =>
            prev.includes(stepId) ? prev : [...prev, stepId]
          )
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,24rem)] lg:items-start lg:gap-8">
      <div className="min-w-0 divide-y divide-subtle">
      <RecordSectionCard
        id="story-info"
        title="Story info"
        variant="panel"
        forceOpen={openSection === 'story-info' || openSection === 'source-content'}
      >
        <StoryInfoLayout
          author={story.author}
          publishedAt={formatDate(story.published_at)}
          ingestedAt={formatDate(story.fetched_at)}
          friendlyId={story.friendly_id}
          storyUuid={story.story_id}
          relevanceStatus={story.relevance_status}
          relevanceScore={story.relevance_score}
          scrapeFailCount={story.scrape_fail_count}
          hasContentClean={story.has_content_clean}
          chunkCount={payload.chunks.length}
          articleText={story.article_text}
          highlightSpan={highlightSpan}
        />
      </RecordSectionCard>

      <RecordSectionCard
        id="chunks"
        title="Chunks"
        variant="panel"
        forceOpen={openSection === 'chunks'}
      >
        <div className="flex flex-col gap-6">
          <ChunksTable
            story={{ story_id: story.story_id, friendly_id: story.friendly_id }}
            chunks={payload.chunks}
          />
          <RecordFieldGrid fields={chunkFields} />
        </div>
      </RecordSectionCard>

      <RecordSectionCard
        id="extracted-atoms"
        title="Extracted atoms"
        variant="panel"
        forceOpen={openSection === 'extracted-atoms'}
      >
        <RecordFieldGrid fields={extractedAtomsFields} />
      </RecordSectionCard>

      <RecordSectionCard
        id="validation-review"
        title="Validation & review"
        variant="panel"
        forceOpen={openSection === 'validation-review'}
      >
        <RecordFieldGrid fields={validationFields} />
      </RecordSectionCard>

      <RecordSectionCard
        id="merge-results"
        title="Merge results"
        variant="panel"
        forceOpen={openSection === 'merge-results'}
      >
        <RecordFieldGrid fields={mergeResultsFields} />
      </RecordSectionCard>

      <RecordSectionCard
        id="post-merge-actions"
        title="Post-merge actions"
        variant="panel"
        forceOpen={openSection === 'post-merge-actions'}
      >
        <div className="flex flex-col gap-6">
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
            showBlockedBanner={false}
            embedded
            toolbarActions={
              <ClearCanonicalButton
                storyId={storyId}
                onCleared={async () => refresh(true)}
                onError={showPipelineError}
              />
            }
          />
          <RecordFieldGrid fields={postMergeFields} />
        </div>
      </RecordSectionCard>

      <RecordAuditSection
        apiPath={`/api/admin/stories/${storyId}/audit`}
        title="History"
        variant="panel"
      />
      </div>

      <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:self-start">
        <StoryLifecycleSteps
          storyId={storyId}
          payload={payload}
          pipelineActions={pipelineActions}
          forceOpen={openSection === 'agent-outputs' || openSection?.startsWith('step-') === true}
          pipelineToolbar={pipelineToolbar}
          onRefresh={async () => refresh(true)}
          onApproveQa={approveQa}
          approvingQa={approving}
          renderFeedback={feedbackRenderer}
          spanHighlight={spanHighlight}
        />
      </aside>
      </div>
      </div>
    </div>
  )
}
