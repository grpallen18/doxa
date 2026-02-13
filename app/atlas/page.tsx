'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LandingHeader } from '@/components/LandingHeader'
import { Panel } from '@/components/Panel'
import { Button } from '@/components/Button'
import AtlasMap, { type VizNode, type VizEdge } from '@/components/atlas/AtlasMap'
import AtlasSidePanel from '@/components/atlas/AtlasSidePanel'

interface VizMap {
  id: string
  name: string
  scope_type: string
  scope_id: string | null
  time_window_days: number | null
  created_at: string
}

interface SearchResult {
  entity_type: 'thesis' | 'claim' | 'story'
  entity_id: string
  map_id: string | null
  label: string
}

export default function AtlasPage() {
  const [maps, setMaps] = useState<VizMap[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [mapData, setMapData] = useState<{ nodes: VizNode[]; edges: VizEdge[] } | null>(null)
  const [selectedNode, setSelectedNode] = useState<VizNode | null>(null)
  const [zoomLevel, setZoomLevel] = useState(2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    fetch(`/api/atlas/maps/${selectedMapId}?layer=${zoomLevel}`)
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
  }, [selectedMapId, zoomLevel])

  const handleNodeClick = useCallback((node: VizNode) => {
    setSelectedNode(node)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      fetch(`/api/atlas/search?q=${encodeURIComponent(searchQuery)}&limit=10`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d?.data ?? []))
        .catch(() => setSearchResults([]))
    }, 200)
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [searchQuery])

  const handleSearchSelect = useCallback(
    (r: SearchResult) => {
      setSearchQuery('')
      setSearchResults([])
      setSearchOpen(false)
      if (r.map_id) {
        setSelectedMapId(r.map_id)
      }
      if (r.entity_type === 'thesis' || r.entity_type === 'claim') {
        const node: VizNode = {
          map_id: r.map_id ?? '',
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          x: 0,
          y: 0,
          layer: r.entity_type === 'thesis' ? 1 : 2,
          size: 1,
        }
        setSelectedNode(node)
      }
    },
    []
  )

  const selectedNodeId = selectedNode ? `${selectedNode.entity_type}:${selectedNode.entity_id}` : null

  if (loading && maps.length === 0) {
    return (
      <main className="min-h-screen px-4 pb-8 pt-6 text-foreground sm:px-6 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <LandingHeader />
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
          <LandingHeader />
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
        <LandingHeader />

        <Panel variant="soft" className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Living Atlas</h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                type="search"
                placeholder="Search theses, claims, stories…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                className="w-56 rounded-md border border-subtle bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              {searchOpen && searchResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-md border border-subtle bg-surface py-1 shadow-lg">
                  {searchResults.map((r) => (
                    <li key={`${r.entity_type}:${r.entity_id}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface-soft"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleSearchSelect(r)
                        }}
                      >
                        <span className="text-xs text-muted">{r.entity_type}</span>
                        <p className="line-clamp-2">{r.label}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Zoom:</span>
              {[1, 2, 3].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setZoomLevel(l)}
                  className={`rounded px-2 py-1 text-xs ${zoomLevel === l ? 'bg-accent-primary text-white' : 'bg-surface text-muted hover:bg-surface-soft'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
          <div className="flex-1" style={{ minHeight: '60vh' }}>
            {mapData ? (
              <AtlasMap
                nodes={mapData.nodes}
                edges={mapData.edges}
                onNodeClick={handleNodeClick}
                onBackgroundClick={handleBackgroundClick}
                selectedNodeId={selectedNodeId}
                zoomLevel={zoomLevel}
              />
            ) : maps.length === 0 ? (
              <Panel variant="soft" className="flex min-h-[400px] items-center justify-center p-8">
                <p className="text-sm text-muted">
                  No maps yet. Maps are generated weekly by the pipeline.
                </p>
              </Panel>
            ) : (
              <Panel variant="soft" className="flex min-h-[400px] items-center justify-center p-8">
                <p className="text-sm text-muted">Loading map…</p>
              </Panel>
            )}
          </div>

          {selectedNode && (
            <div className="w-full md:w-80 shrink-0">
              <AtlasSidePanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
