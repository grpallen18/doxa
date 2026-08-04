import { projectPhase0Document } from '@/lib/admin/neo-graph/project-phase0'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
} from '@/lib/admin/neo-graph/types'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

export const UNION_MAX_STORIES = 10

export type UnionDocumentMeta = {
  uid: string
  title: string | null
  found: boolean
}

/**
 * Merge multiple Phase 0 document projections into one union graph.
 * Shared Publication / Entity nodes collapse by global uid.
 * Agents stay document-scoped; cross-story identity is via person Entities.
 */
export function projectUnionDocuments(
  graphs: NeoDocumentGraph[],
  options?: { missingIds?: string[] }
): DoxaGraphProjection {
  const missingIds = options?.missingIds ?? []
  const nodesById = new Map<string, DoxaGraphNode>()
  const edgesById = new Map<string, DoxaGraphEdge>()
  const documents: Array<{ uid: string; title: string | null }> = []

  for (const graph of graphs) {
    const part = projectPhase0Document(graph)
    documents.push({
      uid: graph.document.uid,
      title: graph.document.title,
    })
    for (const node of part.nodes) {
      const existing = nodesById.get(node.id)
      if (!existing) {
        nodesById.set(node.id, { ...node, degreeHint: 0 })
        continue
      }
      const aliases = Array.from(
        new Set([...existing.aliases, ...node.aliases].filter(Boolean))
      )
      nodesById.set(node.id, {
        ...existing,
        label:
          (node.label?.length ?? 0) > (existing.label?.length ?? 0)
            ? node.label
            : existing.label,
        aliases,
        properties: { ...existing.properties, ...node.properties },
      })
    }
    for (const edge of part.edges) {
      if (!edgesById.has(edge.id)) {
        edgesById.set(edge.id, edge)
      }
    }
  }

  const degree = new Map<string, number>()
  for (const edge of edgesById.values()) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }

  const nodes = Array.from(nodesById.values()).map((n) => ({
    ...n,
    degreeHint: degree.get(n.id) ?? 0,
  }))

  const title =
    documents.length === 0
      ? 'Empty union'
      : documents.length === 1
        ? documents[0].title || documents[0].uid
        : `Union · ${documents.length} stories`

  return {
    projectionId: 'union-documents',
    storyId: null,
    rootId: 'union',
    rootKind: 'union',
    title,
    nodes,
    edges: Array.from(edgesById.values()),
    documents,
    queryTruncated: missingIds.length > 0,
  }
}

export function parseUnionStoryIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,+\s]+/)) {
    const id = part.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= UNION_MAX_STORIES) break
  }
  return out
}
