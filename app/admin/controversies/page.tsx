'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/ui/button'

type ControversyRow = {
  controversy_cluster_id: string
  question: string | null
  summary: string | null
  label: string | null
  status: string
  created_at: string
  position_count: number
  viewpoint_count: number
}

export default function AdminControversiesPage() {
  const [controversies, setControversies] = useState<ControversyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive'>('active')

  const fetchControversies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/positions/controversies?limit=100&status=${statusFilter}`)
      const json = await res.json()
      if (res.ok && json?.data?.items) {
        setControversies(json.data.items)
      } else {
        setControversies([])
      }
    } catch {
      setControversies([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchControversies()
  }, [fetchControversies])

  return (
    <>
        <section aria-labelledby="controversies-heading" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 id="controversies-heading" className="text-xl font-semibold">
              Controversies
            </h1>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('active')}
              >
                Active
              </Button>
              <Button
                size="sm"
                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                onClick={() => setStatusFilter('inactive')}
              >
                Inactive
              </Button>
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : controversies.length === 0 ? (
            <p className="text-sm text-muted">No controversies yet.</p>
          ) : (
            <ul className="space-y-3">
              {controversies.map((c) => (
                <li key={c.controversy_cluster_id}>
                  <Panel variant="soft" interactive={false} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground line-clamp-2">
                          {c.label || c.question || c.summary?.slice(0, 100) || 'No title'}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {c.position_count} positions · {c.viewpoint_count} viewpoints
                        </p>
                      </div>
                      <div className="flex shrink-0">
                        <Link
                          href={`/admin/positions?tab=controversies&id=${c.controversy_cluster_id}`}
                        >
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </section>
    </>
  )
}
