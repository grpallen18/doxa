'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Panel } from '@/components/Panel'

type Detail = {
  controversy: {
    uid: string
    title: string | null
    summary: string | null
    sides_count: number
    topic_key: string | null
  }
  viewpoints: Array<{
    uid: string
    label: string | null
    summary: string | null
    member_count: number
  }>
  evidence: Array<{
    document_uid: string
    utterance_count: number
  }>
}

export default function AdminGraphControversyDetailPage() {
  const params = useParams<{ uid: string }>()
  const uid = decodeURIComponent(params.uid)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/graph-controversies/${encodeURIComponent(uid)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'Failed to load')
        setDetail(null)
        return
      }
      setDetail(json.data as Detail)
      setError(null)
    } catch {
      setError('Failed to load')
      setDetail(null)
    }
  }, [uid])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/admin/graph-controversies" className="text-sm text-muted hover:underline">
        ← Graph controversies
      </Link>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!detail && !error && <p className="text-sm text-muted">Loading…</p>}

      {detail && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {detail.controversy.title || detail.controversy.uid}
              </h1>
              <p className="mt-2 text-sm text-muted">{detail.controversy.summary}</p>
              <p className="mt-1 text-xs text-muted">
                {detail.controversy.sides_count} sides · {detail.controversy.topic_key || '—'}
              </p>
            </div>
            <Link
              href={`/admin/neo/hub/controversy/${encodeURIComponent(detail.controversy.uid)}`}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
            >
              Open in Neo
            </Link>
          </div>

          <Panel>
            <h2 className="mb-3 text-sm font-medium">Viewpoints</h2>
            {detail.viewpoints.length === 0 ? (
              <p className="text-sm text-muted">No viewpoints projected.</p>
            ) : (
              <ul className="space-y-3">
                {detail.viewpoints.map((v) => (
                  <li key={v.uid}>
                    <p className="font-medium">{v.label || v.uid}</p>
                    <p className="text-sm text-muted">{v.summary}</p>
                    <p className="text-xs text-muted">{v.member_count} members</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="mb-3 text-sm font-medium">Evidence documents</h2>
            {detail.evidence.length === 0 ? (
              <p className="text-sm text-muted">No evidence paths projected.</p>
            ) : (
              <ul className="space-y-2">
                {detail.evidence.map((e) => (
                  <li key={e.document_uid} className="text-sm">
                    <Link
                      href={`/admin/neo/${encodeURIComponent(e.document_uid)}`}
                      className="hover:underline"
                    >
                      {e.document_uid}
                    </Link>
                    <span className="text-muted"> · {e.utterance_count} utterances</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
