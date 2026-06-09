'use client'

import { useParams } from 'next/navigation'
import { AuditViewAllPage } from '@/components/admin/record/audit-view-all-page'

export default function StoryAuditHistoryPage() {
  const params = useParams()
  const storyId = typeof params.id === 'string' ? params.id : ''

  return (
    <AuditViewAllPage
      title="Story audit history"
      apiPath={`/api/admin/stories/${storyId}/audit`}
      backHref={`/admin/stories/${storyId}`}
      emptyMessage="No story history recorded yet."
    />
  )
}
