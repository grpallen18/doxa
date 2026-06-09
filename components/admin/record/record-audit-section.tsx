'use client'

import { AuditHistoryPanel } from '@/components/admin/record/audit-history-panel'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'

export function auditApiPathToViewAllHref(apiPath: string): string {
  return apiPath.replace(/^\/api\/admin/, '/admin')
}

export function RecordAuditSection({
  apiPath,
  title = 'Audit history',
  variant = 'panel',
  viewAllHref,
  emptyMessage = 'No records',
}: {
  apiPath: string
  title?: string
  variant?: 'card' | 'panel'
  viewAllHref?: string
  emptyMessage?: string
}) {
  return (
    <RecordSectionCard id="audit-history" title={title} variant={variant}>
      <AuditHistoryPanel
        apiPath={apiPath}
        viewAllHref={viewAllHref ?? auditApiPathToViewAllHref(apiPath)}
        emptyMessage={emptyMessage}
      />
    </RecordSectionCard>
  )
}
