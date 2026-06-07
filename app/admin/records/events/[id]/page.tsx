'use client'

import { useParams } from 'next/navigation'
import type { EventRecordHub } from '@/lib/admin/record-hub/events'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { ProvenanceStoryList, RecordHubShell } from '@/components/admin/record/record-hub-shell'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function CanonicalEventRecordPage() {
  const params = useParams()
  const eventId = typeof params.id === 'string' ? params.id : ''
  const { data, loading, error } = useRecordHub<EventRecordHub>(
    `/api/admin/records/events/${eventId}`
  )

  if (loading) return <p className="p-4 text-sm text-muted">Loading event…</p>
  if (error || !data) return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>

  const lifecycle = {
    title: 'Canonical lifecycle',
    nodes: [
      { id: 'created', label: 'Created', status: 'complete' as const },
      {
        id: 'linked',
        label: 'Linked',
        status: data.story_contributors.length > 0 ? ('complete' as const) : ('pending' as const),
      },
    ],
  }

  return (
    <RecordHubShell
      title={data.canonical_text}
      subtitle="Canonical event"
      meta={[
        { label: 'Event ID', value: <span className="font-mono text-[11px]">{data.event_id}</span> },
        { label: 'Created', value: formatDate(data.created_at) },
        { label: 'Updated', value: formatDate(data.updated_at) },
        { label: 'Actor', value: data.primary_actor ?? '—' },
        { label: 'Action', value: data.action ?? '—' },
        { label: 'Date', value: data.event_date ?? '—' },
        { label: 'Location', value: data.location ?? '—' },
      ]}
      lifecycle={lifecycle}
      sections={[
        {
          id: 'summary',
          title: 'Canonical summary',
          children: <p className="text-sm leading-relaxed">{data.canonical_text}</p>,
        },
        {
          id: 'provenance',
          title: 'Provenance',
          children: (
            <ProvenanceStoryList
              items={data.story_contributors.map((s) => ({
                story_id: s.story_id,
                story_title: s.story_title,
                story_url: s.story_url,
                excerpt: s.event_summary,
                confidence: s.extraction_confidence,
              }))}
            />
          ),
        },
      ]}
    />
  )
}
