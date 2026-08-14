'use client'

import { useEffect, useMemo } from 'react'
import { SigmaContainer, useLoadGraph, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { PersonEidosEdge, PersonEidosNode } from '@/lib/explore/types'

const KIND_COLOR: Record<string, string> = {
  person: '#2a6f6a',
  controversy: '#b45309',
  publication: '#4b5563',
}

function LayoutGraph({
  nodes,
  edges,
}: {
  nodes: PersonEidosNode[]
  edges: PersonEidosEdge[]
}) {
  const loadGraph = useLoadGraph()
  const sigma = useSigma()

  const graph = useMemo(() => {
    const g = new Graph({ multi: false, type: 'undirected' })
    for (const n of nodes) {
      if (g.hasNode(n.id)) continue
      g.addNode(n.id, {
        label: n.label,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: n.size || 6,
        color: KIND_COLOR[n.kind] || '#6b7280',
      })
    }
    for (const e of edges) {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
      const id = `${e.source}->${e.target}`
      if (g.hasEdge(id)) continue
      try {
        g.addEdgeWithKey(id, e.source, e.target, {
          size: 1,
          color: 'rgba(100,100,100,0.35)',
        })
      } catch {
        /* skip bad edges */
      }
    }
    if (g.order > 0) {
      forceAtlas2.assign(g, {
        iterations: Math.min(80, 30 + g.order),
        settings: {
          gravity: 1,
          scalingRatio: 10,
          strongGravityMode: true,
          barnesHutOptimize: g.order > 40,
        },
      })
    }
    return g
  }, [nodes, edges])

  useEffect(() => {
    loadGraph(graph)
    const id = requestAnimationFrame(() => {
      sigma.resize(true)
      sigma.refresh()
    })
    return () => cancelAnimationFrame(id)
  }, [graph, loadGraph, sigma])

  return null
}

export function PersonEidosCanvas({
  nodes,
  edges,
  className,
}: {
  nodes: PersonEidosNode[]
  edges: PersonEidosEdge[]
  className?: string
}) {
  return (
    <div className={className ?? 'h-full w-full'}>
      <SigmaContainer
        style={{ height: '100%', width: '100%', background: 'transparent' }}
        settings={{
          allowInvalidContainer: true,
          renderLabels: true,
          labelFont: 'inherit',
          labelSize: 11,
          labelWeight: '500',
          labelColor: { color: '#374151' },
          defaultEdgeColor: 'rgba(100,100,100,0.35)',
          zIndex: true,
        }}
      >
        <LayoutGraph nodes={nodes} edges={edges} />
      </SigmaContainer>
    </div>
  )
}
