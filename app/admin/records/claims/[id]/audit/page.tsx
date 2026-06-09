'use client'

import { useParams } from 'next/navigation'
import { AuditViewAllPage } from '@/components/admin/record/audit-view-all-page'

export default function ClaimAuditHistoryPage() {
  const params = useParams()
  const claimId = typeof params.id === 'string' ? params.id : ''

  return (
    <AuditViewAllPage
      title="Claim audit history"
      apiPath={`/api/admin/records/claims/${claimId}/audit`}
      backHref={`/admin/records/claims/${claimId}`}
    />
  )
}
