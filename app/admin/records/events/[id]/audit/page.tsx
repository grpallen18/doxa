'use client'

import { useParams } from 'next/navigation'
import { AuditViewAllPage } from '@/components/admin/record/audit-view-all-page'

export default function EventAuditHistoryPage() {
  const params = useParams()
  const eventId = typeof params.id === 'string' ? params.id : ''

  return (
    <AuditViewAllPage
      title="Event audit history"
      apiPath={`/api/admin/records/events/${eventId}/audit`}
      backHref={`/admin/records/events/${eventId}`}
    />
  )
}
