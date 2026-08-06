'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'

type ControversyRow = {
  uid: string
  title: string | null
  summary: string | null
  sides_count: number
  topic_key: string | null
  updated_at: string
}

export default function AdminGraphControversiesPage() {
  const [items, setItems] = useState<ControversyRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/graph-controversies')
      const json = await res.json()
      setItems(res.ok && json?.data?.items ? json.data.items : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Graph controversies</h1>
        <p className="mt-1 text-sm text-muted">
          Neo4j Phase 2 projections (not legacy controversy_clusters).
        </p>
      </div>

      <Panel>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">
            No projected controversies yet. Run{' '}
            <code className="text-xs">debate_pipeline</code> after Arguments exist.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((c) => (
              <li key={c.uid} className="py-3">
                <Link
                  href={`/admin/graph-controversies/${encodeURIComponent(c.uid)}`}
                  className="font-medium hover:underline"
                >
                  {c.title || c.uid}
                </Link>
                <p className="mt-1 text-sm text-muted line-clamp-2">{c.summary}</p>
                <p className="mt-1 text-xs text-muted">
                  {c.sides_count} sides · {c.topic_key || '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs text-muted">
        Neo controversy clusters from the debate pipeline. Open a row for the graph detail view.
      </p>
    </div>
  )
}
