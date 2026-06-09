'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { RecordHubShell } from '@/components/admin/record/record-hub-shell'
import { StatusBadge } from '@/components/admin/record/status-badge'

type AgreementDetail = {
  agreement_cluster_id: string
  label: string | null
  summary: string | null
  status: string
  created_at: string
  controversies: Array<{
    controversy_cluster_id: string
    side: string
    stance_label: string | null
    question: string | null
  }>
  claims: Array<{
    claim_id: string
    canonical_text: string | null
    story_links: Array<{ story_id: string; url?: string }>
  }>
  viewpoints: Array<{
    viewpoint_id: string
    title: string | null
    controversy_cluster_id: string
  }>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AgreementRecordPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const { data, loading, error } = useRecordHub<AgreementDetail>(`/api/admin/positions/${id}`)

  if (loading) return <p className="p-4 text-sm text-muted">Loading agreement…</p>
  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>
  }

  const lifecycle = {
    title: 'Agreement lifecycle',
    nodes: [
      { id: 'created', label: 'Created', status: 'complete' as const },
      {
        id: 'members',
        label: 'Has members',
        status: data.claims.length > 0 ? ('complete' as const) : ('pending' as const),
      },
      {
        id: 'controversy',
        label: 'In controversy',
        status: data.controversies.length > 0 ? ('complete' as const) : ('pending' as const),
      },
    ],
  }

  return (
    <RecordHubShell
      entityType="agreement"
      title={data.label ?? data.summary ?? 'Agreement cluster'}
      subtitle="Agreement cluster"
      meta={[
        {
          label: 'Cluster ID',
          value: <span className="font-mono text-[11px]">{data.agreement_cluster_id}</span>,
        },
        { label: 'Status', value: <StatusBadge label={data.status} /> },
        { label: 'Created', value: formatDate(data.created_at) },
      ]}
      lifecycle={lifecycle}
      sections={[
        {
          id: 'summary',
          title: 'Summary',
          children: <p className="text-sm leading-relaxed">{data.summary ?? '—'}</p>,
        },
        {
          id: 'claims',
          title: 'Member claims',
          children: (
            <ul className="space-y-2 text-sm">
              {data.claims.map((c) => (
                <li key={c.claim_id} className="rounded-md border border-subtle px-3 py-2">
                  <Link
                    href={`/admin/records/claims/${c.claim_id}`}
                    className="text-accent-primary hover:underline"
                  >
                    {c.canonical_text?.slice(0, 160) ?? c.claim_id}
                  </Link>
                </li>
              ))}
              {data.claims.length === 0 && (
                <p className="text-xs text-muted">No member claims.</p>
              )}
            </ul>
          ),
        },
        {
          id: 'controversies',
          title: 'Controversies',
          children: (
            <ul className="space-y-2 text-sm">
              {data.controversies.map((c) => (
                <li key={c.controversy_cluster_id} className="rounded-md border border-subtle px-3 py-2">
                  <Link
                    href={`/admin/controversies/${c.controversy_cluster_id}`}
                    className="font-medium text-accent-primary hover:underline"
                  >
                    {c.question ?? c.controversy_cluster_id.slice(0, 8)}
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    Side {c.side}
                    {c.stance_label ? ` · ${c.stance_label}` : ''}
                  </p>
                </li>
              ))}
              {data.controversies.length === 0 && (
                <p className="text-xs text-muted">Not linked to controversies.</p>
              )}
            </ul>
          ),
        },
      ]}
    />
  )
}
