'use client'

import dynamic from 'next/dynamic'
import type { PersonEidosEdge, PersonEidosNode } from '@/lib/explore/types'

const PersonEidosCanvas = dynamic(
  () =>
    import('@/components/explore/person-eidos-canvas').then((m) => m.PersonEidosCanvas),
  { ssr: false, loading: () => <p className="text-sm text-muted">Loading Eidos…</p> }
)

export function PersonEidosCanvasLazy({
  nodes,
  edges,
  className,
}: {
  nodes: PersonEidosNode[]
  edges: PersonEidosEdge[]
  className?: string
}) {
  return <PersonEidosCanvas nodes={nodes} edges={edges} className={className} />
}
