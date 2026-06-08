'use client'

import { useEffect, useState } from 'react'
import type { HistoryEvent } from '@/lib/admin/history'
import { AuditTimeline } from '@/components/admin/record/audit-timeline'
import { RecordSectionCard } from '@/components/admin/record/record-section-card'

export function RecordAuditSection({
  apiPath,
  title = 'Audit history',
  variant = 'panel',
}: {
  apiPath: string
  title?: string
  variant?: 'card' | 'panel'
}) {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(apiPath, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok || json.error || !json.data?.events) {
          setError(json.error?.message ?? 'Failed to load audit history')
          setEvents([])
          return
        }
        setEvents(json.data.events)
      })
      .catch(() => {
        setError('Failed to load audit history')
        setEvents([])
      })
      .finally(() => setLoading(false))
  }, [apiPath])

  return (
    <RecordSectionCard id="audit-history" title={title} variant={variant}>
      {loading && <p className="text-xs text-muted">Loading audit history…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!loading && !error && <AuditTimeline events={events} />}
    </RecordSectionCard>
  )
}
