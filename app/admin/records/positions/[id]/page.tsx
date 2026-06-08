'use client'

import { useParams } from 'next/navigation'
import type { PositionRecordHub } from '@/lib/admin/record-hub/positions'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import {
  ClusterLinkList,
  ProvenanceStoryList,
  RecordHubShell,
} from '@/components/admin/record/record-hub-shell'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function CanonicalPositionRecordPage() {
  const params = useParams()
  const positionId = typeof params.id === 'string' ? params.id : ''
  const { data, loading, error } = useRecordHub<PositionRecordHub>(
    `/api/admin/records/positions/${positionId}`
  )

  if (loading) return <p className="p-4 text-sm text-muted">Loading position…</p>
  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>
  }

  const lifecycle = {
    title: 'Canonical lifecycle',
    nodes: [
      { id: 'created', label: 'Created', status: 'complete' as const },
      {
        id: 'linked',
        label: 'Linked',
        status: data.story_contributors.length > 0 ? ('complete' as const) : ('pending' as const),
      },
      {
        id: 'clustered',
        label: 'Clustered',
        status:
          data.agreement_cluster_ids.length > 0 ? ('complete' as const) : ('pending' as const),
      },
    ],
  }

  return (
    <RecordHubShell
      title={data.canonical_text}
      subtitle="Canonical position"
      meta={[
        {
          label: 'Position ID',
          value: <span className="font-mono text-[11px]">{data.canonical_position_id}</span>,
        },
        { label: 'Created', value: formatDate(data.created_at) },
        { label: 'Updated', value: formatDate(data.updated_at) },
        { label: 'Primary topic', value: data.primary_topic_id ?? '—' },
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
                excerpt: s.raw_text,
                confidence: s.extraction_confidence,
              }))}
            />
          ),
        },
        {
          id: 'relationships',
          title: 'Relationships',
          children: (
            <>
              <ClusterLinkList ids={data.agreement_cluster_ids} label="Agreement clusters" />
              {data.agreement_cluster_ids.length === 0 && (
                <p className="text-xs text-muted">Not in any agreement cluster yet.</p>
              )}
            </>
          ),
        },
      ]}
      auditApiPath={`/api/admin/records/positions/${positionId}/audit`}
    />
  )
}
