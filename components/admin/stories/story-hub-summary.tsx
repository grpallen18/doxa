'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MergedEntitiesDetail } from '@/components/admin/pipeline/pipeline-step-details'
import { deriveStageSummaries, isPipelineBlocked } from '@/lib/admin/story-pipeline-checklist'
import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { qaStatusLabel } from '@/lib/admin/extraction-qa-types'
import { StoryExtractionExportButtons } from '@/components/admin/stories/story-extraction-export-buttons'
import { StoryFeedbackButtons } from '@/components/admin/stories/story-feedback-buttons'

export function StoryHubSummary({
  payload,
  storyId,
  onRefresh,
  onApproveQa,
  approvingQa,
}: {
  payload: StoryExtractionReviewPayload
  storyId: string
  onRefresh: () => void | Promise<void>
  onApproveQa: () => Promise<void>
  approvingQa: boolean
}) {
  const stages = useMemo(() => deriveStageSummaries(storyId, payload), [storyId, payload])
  const blocked = isPipelineBlocked(payload)

  return (
    <Panel variant="soft" interactive={false} className="flex min-h-[400px] flex-col overflow-hidden lg:h-full lg:min-h-0">
      <div className="shrink-0 space-y-3 border-b border-subtle p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Extraction output</h3>
          <div className="flex flex-wrap gap-2">
            <StoryExtractionExportButtons payload={payload} storyId={storyId} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
          <p>Claims: {payload.claims.length}</p>
          <p>Evidence: {payload.evidence.length}</p>
          <p>Positions: {payload.positions.length}</p>
          <p>Events: {payload.events.length}</p>
        </div>
        <p className="text-xs text-muted">QA: {qaStatusLabel(payload.story.extraction_qa_status)}</p>
      </div>

      {blocked && (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <p>Extraction QA needs attention.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={approvingQa}
              onClick={() => void onApproveQa()}
            >
              {approvingQa ? 'Approving…' : 'Approve QA'}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={`/admin/stories/${storyId}/extraction`}>Open extraction stage</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-subtle p-4">
        <p className="text-xs font-medium text-muted">Pipeline stages</p>
        <ul className="mt-2 space-y-1.5">
          {stages.map((stage) => (
            <li key={stage.stageId}>
              <Link
                href={stage.href}
                className="flex items-center justify-between rounded-md border border-subtle px-3 py-2 text-sm hover:bg-muted/30"
              >
                <span>{stage.label}</span>
                <span className="text-xs capitalize text-muted">{stage.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-4 lg:h-0">
        <MergedEntitiesDetail
          payload={payload}
          renderFeedback={({ entityType, entityId, existingRating }) => (
            <StoryFeedbackButtons
              storyId={storyId}
              entityType={entityType}
              entityId={entityId}
              existingRating={existingRating}
              onSubmitted={onRefresh}
            />
          )}
        />
      </ScrollArea>
    </Panel>
  )
}
