'use client'

import { useParams } from 'next/navigation'
import { StoryReviewChrome } from '@/components/admin/stories/story-review-chrome'
import { StoryReviewProvider } from '@/components/admin/stories/story-review-provider'

export default function AdminStoryReviewLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const storyId = typeof params.id === 'string' ? params.id : ''

  if (!storyId) {
    return <p className="text-sm text-destructive">Missing story ID</p>
  }

  return (
    <StoryReviewProvider storyId={storyId}>
      <StoryReviewChrome>{children}</StoryReviewChrome>
    </StoryReviewProvider>
  )
}
