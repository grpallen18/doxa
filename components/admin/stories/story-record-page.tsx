'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { formatAdminDateTime } from '@/lib/admin/format-datetime'

export function StoryRecordPage() {
  const { storyId, payload } = useStoryReview()

  if (!payload) return null

  return (
    <StoryRecordPageContent
      storyId={storyId}
      payload={payload}
    />
  )
}

function StoryRecordPageContent({
  storyId,
  payload,
}: {
  storyId: string
  payload: NonNullable<ReturnType<typeof useStoryReview>['payload']>
}) {
  const [openSection, setOpenSection] = useState<string | null>(null)

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

      <EntityHeader
        layout="record"
        embedded
        entityType="story"
        title={story.title}
        actions={
          <Button variant="outline" size="sm" className="h-8" asChild>
            <Link href={`/admin/stories/${storyId}/agent-flow`}>Agent Flow</Link>
          </Button>
        }
      />
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

      <div className="flex flex-col gap-4 pt-4">
        <RecordSectionCard
          id="story-info"
          title="Story info"
          variant="panel"
          forceOpen={openSection === 'story-info' || openSection === 'source-content'}
        >
          <StoryInfoLayout
            author={story.author}
            publishedAt={formatAdminDateTime(story.published_at)}
            ingestedAt={formatAdminDateTime(story.fetched_at)}
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
    </RecordPageFrame>
  )
}
