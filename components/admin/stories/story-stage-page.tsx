'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PipelineStageId } from '@/lib/admin/generated/pipeline-catalog'
import { ClearCanonicalButton } from '@/components/admin/pipeline/clear-canonical-button'
import { ClearExtractionButton } from '@/components/admin/pipeline/clear-extraction-button'
import { PipelineChecklist } from '@/components/admin/pipeline/pipeline-checklist'
import { StoryExtractionExportButtons } from '@/components/admin/stories/story-extraction-export-buttons'
import { StoryFeedbackButtons } from '@/components/admin/stories/story-feedback-buttons'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { storyAdminHref } from '@/lib/admin/friendly-id'
import { showPipelineError } from '@/lib/admin/pipeline-toast'
import { RecordPageFrame } from '@/components/admin/record/record-page-frame'

const STAGE_META: Record<
  PipelineStageId,
  { title: string; description: string }
> = {
  ingestion: {
    title: 'Ingestion pipeline',
    description: 'Qualify (Keep/Drop/Pending), scrape, and clean story content.',
  },
  extraction: {
    title: 'Extraction pipeline',
    description: 'Chunk, extract (with review), and merge (with approve).',
  },
  canonical: {
    title: 'Canonicalization pipeline',
    description: 'Link story entities to global canonical rows and backfill stances.',
  },
}

export function StoryStagePage({ stageId }: { stageId: PipelineStageId }) {
  const { storyId, payload, refresh } = useStoryReview()
  const [approving, setApproving] = useState(false)
  const meta = STAGE_META[stageId]

  if (!payload) return null

  const approveQa = async () => {
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
  }

  const toolbar =
    stageId === 'extraction' ? (
      <ClearExtractionButton
        storyId={storyId}
        onCleared={async () => refresh(true)}
        onError={showPipelineError}
      />
    ) : stageId === 'canonical' ? (
      <ClearCanonicalButton
        storyId={storyId}
        onCleared={async () => refresh(true)}
        onError={showPipelineError}
      />
    ) : null

  const headerActions = (
    <>
      <StoryExtractionExportButtons payload={payload} scope="story_stage" stageId={stageId} />
      {toolbar}
    </>
  )

  return (
    <RecordPageFrame>
      <PipelineChecklist
        payload={payload}
        storyId={storyId}
        stageId={stageId}
        title={meta.title}
        description={meta.description}
        onRefresh={async () => refresh(true)}
        onApproveQa={approveQa}
        approvingQa={approving}
        headerActions={headerActions}
        renderFeedback={({ entityType, entityId, existingRating }) => (
          <StoryFeedbackButtons
            storyId={storyId}
            entityType={entityType}
            entityId={entityId}
            existingRating={existingRating}
            onSubmitted={() => void refresh(true)}
          />
        )}
      />
      <p className="mt-4 text-xs text-muted">
        <Link href={storyAdminHref(payload.story)} className="text-accent-primary hover:underline">
          Back to story overview
        </Link>
      </p>
    </RecordPageFrame>
  )
}
