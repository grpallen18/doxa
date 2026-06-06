'use client'

import { PipelineStepper } from '@/components/admin/pipeline/pipeline-stepper'
import { useStoryReview } from '@/components/admin/stories/story-review-provider'

export function StoryReviewChrome({ children }: { children: React.ReactNode }) {
  const { payload, loading, error } = useStoryReview()

  return (
    <div className="flex w-full flex-col gap-4">
      {loading && <p className="text-sm text-muted">Loading story review…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && payload && (
        <>
          <PipelineStepper storyId={payload.story.story_id} payload={payload} />
          {children}
        </>
      )}
    </div>
  )
}
