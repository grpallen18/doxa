'use client'

import { useCallback, useMemo, useState } from 'react'
import { useStoryPipelineActions } from '@/components/admin/pipeline/use-story-pipeline-actions'
import { StoryExtractionExportButtons } from '@/components/admin/stories/story-extraction-export-buttons'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { StoryAnchorScroll } from '@/components/admin/stories/story-anchor-scroll'
import { EntityHeader } from '@/components/admin/record/entity-header'
import { RecordPageFrame } from '@/components/admin/record/record-page-frame'
import { RecordAuditSection } from '@/components/admin/record/record-audit-section'
import { RecordEntityLinkBar } from '@/components/admin/record/record-entity-link-bar'
import { RecordFieldGrid } from '@/components/admin/record/record-field-grid'
import { StoryInfoLayout } from '@/components/admin/stories/story-info-layout'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'
import {
  extractedAtomsSectionFields,
} from '@/lib/admin/story-record-section-fields'
import { ChunksTable } from '@/components/admin/stories/chunks-table'
import { StoryLifecycleFlowchart } from '@/components/admin/stories/story-lifecycle-flowchart'

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
  const [openSection, setOpenSection] = useState<string | null>(null)

  const pipelineActions = useStoryPipelineActions({
    storyId,
    payload,
    onRefresh: async () => refresh(true),
  })

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

  const extractedAtomsFields = useMemo(
    () => extractedAtomsSectionFields(payload),
    [payload]
  )

  return (
    <RecordPageFrame>
      <StoryAnchorScroll onSectionVisible={handleSectionVisible} />

      <EntityHeader layout="record" embedded entityType="story" title={story.title} />
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

      <div className="flex flex-col gap-6 pt-4 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1 flex flex-col gap-4">
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
          highlightSpan={null}
        />
      </RecordSectionCard>

      <RecordSectionCard
        id="chunks"
        title={`Chunks (${payload.chunks.length})`}
        variant="panel"
        forceOpen={openSection === 'chunks'}
      >
        <ChunksTable
          story={{ story_id: story.story_id, friendly_id: story.friendly_id }}
          chunks={payload.chunks}
        />
      </RecordSectionCard>

      <RecordSectionCard
        id="extracted-atoms"
        title="Extracted atoms"
        variant="panel"
        forceOpen={openSection === 'extracted-atoms'}
      >
        <RecordFieldGrid fields={extractedAtomsFields} />
      </RecordSectionCard>

      <RecordAuditSection
        apiPath={`/api/admin/stories/${storyId}/audit`}
        title="History"
        variant="panel"
      />
        </div>

        <aside className="w-fit max-w-full shrink-0">
          <StoryLifecycleFlowchart
            payload={payload}
            pipelineActions={pipelineActions}
            forceOpen={
              openSection === 'lifecycle-flowchart' || openSection?.startsWith('step-') === true
            }
            pipelineToolbar={
              <StoryExtractionExportButtons payload={payload} scope="story_record" compact />
            }
            onApproveQa={approveQa}
            approvingQa={approving}
          />
        </aside>
      </div>
    </RecordPageFrame>
  )
}
