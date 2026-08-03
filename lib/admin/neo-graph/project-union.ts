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

function agentCollapseKey(node: DoxaGraphNode): string | null {
  if (node.kind !== 'agent') return null
  const norm =
    (typeof node.properties.normalizedName === 'string' &&
      node.properties.normalizedName.trim().toLowerCase()) ||
    (typeof node.properties.name === 'string' &&
      node.properties.name.trim().toLowerCase()) ||
    node.label.trim().toLowerCase()
  const collapsed = norm.replace(/\s+/g, ' ').trim()
  return collapsed || null
}

function unionAgentId(normalizedKey: string): string {
  const slug =
    normalizedKey
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'unknown'
  return `agent:union:${slug}`
}

/**
 * Display-only: collapse document-scoped Agents that share a normalized name
 * into one visual node. Aura Agent uids remain unchanged.
 */
function collapseAgentsForDisplay(
  nodesById: Map<string, DoxaGraphNode>,
  edgesById: Map<string, DoxaGraphEdge>
): void {
  const keyToCanonical = new Map<string, string>()
  const idRemap = new Map<string, string>()

  for (const node of nodesById.values()) {
    const key = agentCollapseKey(node)
    if (!key) continue
    let canonicalId = keyToCanonical.get(key)
    if (!canonicalId) {
      canonicalId = unionAgentId(key)
      keyToCanonical.set(key, canonicalId)
    }
    idRemap.set(node.id, canonicalId)
  }

  if (idRemap.size === 0) return

  // Merge agent nodes into canonical ids
  for (const [oldId, canonicalId] of idRemap) {
    const node = nodesById.get(oldId)
    if (!node) continue
    nodesById.delete(oldId)
    const existing = nodesById.get(canonicalId)
    const sourceUid =
      typeof node.properties.uid === 'string' ? node.properties.uid : oldId
    if (!existing) {
      const sourceUids = [sourceUid]
      nodesById.set(canonicalId, {
        ...node,
        id: canonicalId,
        degreeHint: 0,
        aliases: Array.from(
          new Set([...node.aliases, sourceUid, 'union-collapsed'])
        ),
        properties: {
          ...node.properties,
          uid: canonicalId,
          sourceAgentUids: sourceUids.join(','),
          unionCollapsed: true,
        },
      })
      continue
    }
    const prevSources =
      typeof existing.properties.sourceAgentUids === 'string'
        ? existing.properties.sourceAgentUids.split(',').filter(Boolean)
        : []
    const sourceUids = Array.from(new Set([...prevSources, sourceUid]))
    nodesById.set(canonicalId, {
      ...existing,
      label:
        (node.label?.length ?? 0) > (existing.label?.length ?? 0)
          ? node.label
          : existing.label,
      aliases: Array.from(
        new Set([...existing.aliases, ...node.aliases, sourceUid])
      ),
      properties: {
        ...existing.properties,
        ...node.properties,
        uid: canonicalId,
        sourceAgentUids: sourceUids.join(','),
        unionCollapsed: true,
      },
    })
  }

  // Rewrite edges onto canonical agent ids
  const rewritten = new Map<string, DoxaGraphEdge>()
  for (const edge of edgesById.values()) {
    const source = idRemap.get(edge.source) ?? edge.source
    const target = idRemap.get(edge.target) ?? edge.target
    if (source === target) continue
    const id = `${source}->${target}:${edge.type}`
    if (rewritten.has(id)) continue
    rewritten.set(id, {
      ...edge,
      id,
      source,
      target,
    })
  }
  edgesById.clear()
  for (const [id, edge] of rewritten) {
    edgesById.set(id, edge)
  }
}

/**
 * Merge multiple Phase 0 document projections into one union graph.
 * Shared Publication / Entity nodes collapse by id.
 * Agents with the same normalizedName collapse for display only.
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

  collapseAgentsForDisplay(nodesById, edgesById)

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
