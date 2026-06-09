'use client'

import { useStoryReview } from '@/components/admin/stories/story-review-provider'
import { recordPagePaddingClass } from '@/components/admin/record/record-page-frame'
import { cn } from '@/lib/utils'

export function StoryReviewChrome({ children }: { children: React.ReactNode }) {
  const { loading, error } = useStoryReview()

  if (loading) {
    return (
      <p className={cn(recordPagePaddingClass, 'py-4 text-sm text-muted')}>
        Loading story review…
      </p>
    )
  }

  if (error) {
    return (
      <p className={cn(recordPagePaddingClass, 'py-4 text-sm text-destructive')}>
        {error}
      </p>
    )
  }

  return children
}
