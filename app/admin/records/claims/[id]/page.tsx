'use client'

import { useParams } from 'next/navigation'
import type { ClaimRecordHub } from '@/lib/admin/record-hub/claims'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import {
  ClusterLinkList,
  ProvenanceStoryList,
  RecordHubShell,
} from '@/components/admin/record/record-hub-shell'
import { RecordPageError, RecordPageLoading } from '@/components/admin/record/record-page-frame'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'

export default function CanonicalClaimRecordPage() {
  const params = useParams()
  const claimId = typeof params.id === 'string' ? params.id : ''
  const { data, loading, error } = useRecordHub<ClaimRecordHub>(
    `/api/admin/records/claims/${claimId}`
  )

  if (loading) return <RecordPageLoading message="Loading claim…" />
  if (error || !data) return <RecordPageError message={error ?? 'Not found'} />

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
        label: 'In cluster',
        status:
          data.agreement_cluster_ids.length > 0 ? ('complete' as const) : ('pending' as const),
      },
    ],
  }

  return (
    <RecordHubShell
      entityType="claim"
      title={data.canonical_text}
      subtitle="Canonical claim"
      meta={[
        { label: 'Claim ID', value: <span className="font-mono text-[11px]">{data.claim_id}</span> },
        { label: 'Created', value: formatAdminDateTime(data.created_at) },
        { label: 'Updated', value: formatAdminDateTime(data.updated_at) },
        { label: 'Subject', value: data.subject ?? '—' },
        { label: 'Predicate', value: data.predicate ?? '—' },
        { label: 'Object', value: data.object ?? '—' },
      ]}
      lifecycle={lifecycle}
      sections={[
        {
          id: 'summary',
          title: 'Canonical summary',
          children: (
            <p className="text-sm leading-relaxed">{data.canonical_text}</p>
          ),
        },
        {
          id: 'provenance',
          title: 'Provenance',
          description: 'Stories and story-local atoms that contributed to this claim.',
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
      auditApiPath={`/api/admin/records/claims/${claimId}/audit`}
    />
  )
}
