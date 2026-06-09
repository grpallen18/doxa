'use client'

import { useStoryReview } from '@/components/admin/stories/story-review-provider'

export function StoryReviewChrome({ children }: { children: React.ReactNode }) {
  const { loading, error } = useStoryReview()

  if (loading) {
    return <p className="text-sm text-muted">Loading story review…</p>
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  return children
}
