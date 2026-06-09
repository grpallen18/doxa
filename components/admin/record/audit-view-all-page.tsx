'use client'

import Link from 'next/link'
import { AuditHistoryPanel } from '@/components/admin/record/audit-history-panel'

export function AuditViewAllPage({
  title,
  apiPath,
  backHref,
  emptyMessage = 'No records',
}: {
  title: string
  apiPath: string
  backHref: string
  emptyMessage?: string
}) {
  return (
    <div className="space-y-4 p-4">
      <Link href={backHref} className="text-sm text-accent-primary hover:underline">
        ← Back
      </Link>
      <h1 className="text-lg font-semibold">{title}</h1>
      <AuditHistoryPanel
        apiPath={apiPath}
        viewAll
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
