'use client'

import { useEffect, useState } from 'react'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import AtlasNodeTestCanvas from '@/components/atlas/AtlasNodeTestCanvas'
import type { VizNode, VizEdge } from '@/components/atlas/types'

interface VizMap {
  id: string
  name: string
  scope_type: string
  scope_id: string | null
  time_window_days: number | null
  created_at: string
}

export default function AtlasPage() {
  const [maps, setMaps] = useState<VizMap[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [mapData, setMapData] = useState<{ nodes: VizNode[]; edges: VizEdge[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/atlas/maps')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) {
          setMaps(d.data)
          if (d.data.length > 0 && !selectedMapId) {
            setSelectedMapId(d.data[0].id)
          }
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!selectedMapId) {
      setMapData(null)
      return
    }
    setLoading(true)
    fetch(`/api/atlas/maps/${selectedMapId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) {
          setMapData({
            nodes: d.data.nodes ?? [],
            edges: d.data.edges ?? [],
          })
        } else {
          setMapData(null)
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [selectedMapId])

  if (loading && maps.length === 0) {
    return (
      <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <LandingHeader variant="atlas" />
          <Panel variant="soft" className="flex min-h-[400px] items-center justify-center p-8">
            <div className="flex flex-col items-center gap-4">
              <div
                className="h-12 w-12 animate-spin rounded-full border-2 border-muted border-t-accent-primary"
                aria-hidden
              />
              <p className="text-sm text-muted">Loading atlas…</p>
            </div>
          </Panel>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <LandingHeader variant="atlas" />
          <Panel variant="soft" className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="text-sm text-foreground">Error: {error}</p>
            <Button onClick={() => window.location.reload()} variant="primary">
              Retry
            </Button>
          </Panel>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <LandingHeader variant="atlas" />

        <Panel variant="soft" className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Living Atlas</h1>
          {maps.length > 0 && (
            <select
              value={selectedMapId ?? ''}
              onChange={(e) => setSelectedMapId(e.target.value || null)}
              className="rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-foreground"
            >
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </Panel>

        <Panel variant="soft" interactive={false} className="overflow-hidden p-0">
          <AtlasNodeTestCanvas
            thesisNode={mapData?.nodes.find((n) => n.entity_type === 'thesis') ?? null}
            nodes={mapData?.nodes ?? []}
            edges={mapData?.edges ?? []}
          />
        </Panel>
      </div>
    </main>
  )
}
