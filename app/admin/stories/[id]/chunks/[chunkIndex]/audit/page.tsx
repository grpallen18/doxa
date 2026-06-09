'use client'

import { useParams } from 'next/navigation'
import { AuditViewAllPage } from '@/components/admin/record/audit-view-all-page'

export default function ChunkAuditHistoryPage() {
  const params = useParams()
  const storyId = typeof params.id === 'string' ? params.id : ''
  const chunkIndex = typeof params.chunkIndex === 'string' ? params.chunkIndex : ''

  return (
    <AuditViewAllPage
      title="Chunk audit history"
      apiPath={`/api/admin/stories/${storyId}/chunks/${chunkIndex}/audit`}
      backHref={`/admin/stories/${storyId}/chunks/${chunkIndex}`}
      emptyMessage="No chunk history recorded yet."
    />
  )
}
