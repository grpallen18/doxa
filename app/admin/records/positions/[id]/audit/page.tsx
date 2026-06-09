'use client'

import { useParams } from 'next/navigation'
import { AuditViewAllPage } from '@/components/admin/record/audit-view-all-page'

export default function PositionAuditHistoryPage() {
  const params = useParams()
  const positionId = typeof params.id === 'string' ? params.id : ''

  return (
    <AuditViewAllPage
      title="Position audit history"
      apiPath={`/api/admin/records/positions/${positionId}/audit`}
      backHref={`/admin/records/positions/${positionId}`}
    />
  )
}
