'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useRecordHub } from '@/components/admin/record/use-record-hub'
import { RecordHubShell } from '@/components/admin/record/record-hub-shell'
import { StatusBadge } from '@/components/admin/record/status-badge'

type ControversyDetail = {
  controversy_cluster_id: string
  question: string | null
  summary: string | null
  label: string | null
  status: string
  created_at: string
  positions: Array<{
    agreement_cluster_id: string
    side: string
    stance_label: string | null
    label: string | null
    summary: string | null
  }>
  viewpoints: Array<{
    viewpoint_id: string
    title: string | null
    agreement_cluster_id: string
  }>
  topics: Array<{ topic_id: string; title: string; slug: string }>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ControversyRecordPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const { data, loading, error } = useRecordHub<ControversyDetail>(
    `/api/admin/positions/controversies/${id}`
  )

  if (loading) return <p className="p-4 text-sm text-muted">Loading controversy…</p>
  if (error || !data) {
    return <p className="p-4 text-sm text-destructive">{error ?? 'Not found'}</p>
  }

  const lifecycle = {
    title: 'Controversy lifecycle',
    nodes: [
      { id: 'created', label: 'Created', status: 'complete' as const },
      {
        id: 'sides',
        label: 'Has sides',
        status: data.positions.length > 0 ? ('complete' as const) : ('pending' as const),
      },
      {
        id: 'viewpoints',
        label: 'Viewpoints',
        status: data.viewpoints.length > 0 ? ('complete' as const) : ('pending' as const),
      },
    ],
  }

  return (
    <RecordHubShell
      entityType="controversy"
      title={data.question ?? data.label ?? 'Controversy'}
      subtitle="Controversy cluster"
      meta={[
        {
          label: 'Controversy ID',
          value: <span className="font-mono text-[11px]">{data.controversy_cluster_id}</span>,
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
          id: 'agreements',
          title: 'Agreement sides',
          children: (
            <ul className="space-y-2 text-sm">
              {data.positions.map((p) => (
                <li
                  key={`${p.agreement_cluster_id}-${p.side}`}
                  className="rounded-md border border-subtle px-3 py-2"
                >
                  <Link
                    href={`/admin/agreements/${p.agreement_cluster_id}`}
                    className="font-medium text-accent-primary hover:underline"
                  >
                    {p.label ?? p.summary ?? p.agreement_cluster_id.slice(0, 8)}
                  </Link>
                  <p className="mt-1 text-xs text-muted">
                    Side {p.side}
                    {p.stance_label ? ` · ${p.stance_label}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: 'viewpoints',
          title: 'Viewpoints',
          children: (
            <ul className="space-y-2 text-sm">
              {data.viewpoints.map((v) => (
                <li key={v.viewpoint_id} className="rounded-md border border-subtle px-3 py-2">
                  <p className="font-medium">{v.title ?? v.viewpoint_id.slice(0, 8)}</p>
                </li>
              ))}
              {data.viewpoints.length === 0 && (
                <p className="text-xs text-muted">No viewpoints yet.</p>
              )}
            </ul>
          ),
        },
        {
          id: 'topics',
          title: 'Linked topics',
          children: (
            <ul className="space-y-1 text-sm">
              {data.topics.map((t) => (
                <li key={t.topic_id}>
                  <Link href={`/page/${t.topic_id}`} className="text-accent-primary hover:underline">
                    {t.title}
                  </Link>
                </li>
              ))}
              {data.topics.length === 0 && (
                <p className="text-xs text-muted">No linked topics.</p>
              )}
            </ul>
          ),
        },
      ]}
    />
  )
}
