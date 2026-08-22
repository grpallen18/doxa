'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Panel } from '@/components/Panel'
import { controversyDisplayName } from '@/lib/admin/controversy-display'
import {
  neoUnionQuestionHref,
  questionUidFromControversyUid,
} from '@/lib/admin/question-uid'

type Detail = {
  controversy: {
    uid: string
    title: string | null
    summary: string | null
    sides_count: number
    source_count: number
    topic_key: string | null
    status: string
    publish_block_reason: string | null
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
  assessments: Array<{
    uid: string
    kind: string | null
    summary: string | null
    confidence: number | null
    method_run_uid: string | null
    layer: string
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
                {controversyDisplayName(detail.controversy)}
              </h1>
              <p className="mt-2 text-sm text-muted">{detail.controversy.summary}</p>
              <p className="mt-1 text-xs text-muted">
                {detail.controversy.sides_count} sides · {detail.controversy.source_count} sources
                · {detail.controversy.topic_key || '—'}
              </p>
              <p className="mt-2 text-xs">
                <span className="font-semibold uppercase tracking-wide text-muted">Status</span>{' '}
                <span className="text-foreground">{detail.controversy.status}</span>
                {detail.controversy.publish_block_reason && (
                  <span className="text-muted"> · {detail.controversy.publish_block_reason}</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/neo/union?focus=controversy:${encodeURIComponent(detail.controversy.uid)}`}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
              >
                Open in Neo
              </Link>
              {(() => {
                const qUid = questionUidFromControversyUid(detail.controversy.uid)
                if (!qUid) return null
                return (
                  <Link
                    href={neoUnionQuestionHref(qUid)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/40"
                  >
                    Open Question in Neo
                  </Link>
                )
              })()}
            </div>
          </div>

          <Panel>
            <h2 className="mb-1 text-sm font-medium">Analyzed</h2>
            <p className="mb-3 text-xs text-muted">
              Model-derived assessments — not extracted facts from source text.
            </p>
            {(detail.assessments ?? []).length === 0 ? (
              <p className="text-sm text-muted">No assessments projected yet.</p>
            ) : (
              <ul className="space-y-3">
                {(detail.assessments ?? []).map((a) => (
                  <li
                    key={a.uid}
                    className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Analyzed
                      </span>
                      <span className="text-xs text-muted">{a.kind || 'other'}</span>
                      {a.confidence != null && (
                        <span className="text-xs text-muted">
                          conf {Number(a.confidence).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{a.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

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
                      href={`/admin/neo/union?focus=document:${encodeURIComponent(e.document_uid)}`}
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
