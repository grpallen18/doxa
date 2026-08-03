'use client'

import { useCallback, useMemo } from 'react'
import {
  NeoProjectionExplorer,
  type UtteranceHighlight,
} from '@/components/admin/neo/projection-explorer'
import { projectPhase0Document } from '@/lib/admin/neo-graph/project-phase0'
import { DEFAULT_NEO_FILTERS } from '@/lib/admin/neo-graph/types'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

export function NeoGraphExplorer({
  graph,
  storyId,
  onUtteranceHighlight,
  className,
}: {
  graph: NeoDocumentGraph
  storyId: string
  onUtteranceHighlight: (span: { start: number; end: number } | null) => void
  className?: string
}) {
  const projection = useMemo(() => projectPhase0Document(graph), [graph])

  const handleHighlight = useCallback(
    (span: UtteranceHighlight | null) => {
      if (!span) {
        onUtteranceHighlight(null)
        return
      }
      onUtteranceHighlight({ start: span.start, end: span.end })
    },
    [onUtteranceHighlight]
  )

  return (
    <NeoProjectionExplorer
      projection={projection}
      contextStoryId={storyId}
      defaultFilters={DEFAULT_NEO_FILTERS}
      onUtteranceHighlight={handleHighlight}
      className={className}
    />
  )
}
