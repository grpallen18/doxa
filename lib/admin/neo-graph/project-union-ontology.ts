import { projectUnionDocuments } from '@/lib/admin/neo-graph/project-union'
import {
  COMMUNITY_BRIDGE,
  COMMUNITY_UNLINKED,
  controversyCommunityId,
  isIslandCommunityId,
  publicationCommunityId,
} from '@/lib/admin/neo-graph/community-ids'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoGraphCommunity,
  NeoNodeKind,
} from '@/lib/admin/neo-graph/types'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import type { UnionOntologyOverlay } from '@/lib/neo4j/queries/union-ontology'
import { emptyUnionOntologyOverlay } from '@/lib/neo4j/queries/union-ontology'

function controversyDisplayLabel(title: string | null | undefined): string {
  const raw = (title ?? '').trim() || 'Controversy'
  return raw.replace(/^controversy:\s*/i, '').trim() || raw
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function nodeId(kind: string, uid: string): string {
  return `${kind}:${uid}`
}

function edgeId(type: string, source: string, target: string): string {
  return `${source}->${target}:${type}`
}

function uidOf(node: DoxaGraphNode): string | null {
  const uid = node.properties?.uid
  return typeof uid === 'string' && uid ? uid : null
}

function documentUidOf(node: DoxaGraphNode): string | null {
  const doc = node.properties?.documentUid
  if (typeof doc === 'string' && doc) return doc
  if (node.kind === 'document') return uidOf(node)
  return null
}

function ensureNode(
  nodesById: Map<string, DoxaGraphNode>,
  node: DoxaGraphNode
): void {
  const existing = nodesById.get(node.id)
  if (!existing) {
    nodesById.set(node.id, node)
    return
  }
  nodesById.set(node.id, {
    ...existing,
    label:
      (node.label?.length ?? 0) > (existing.label?.length ?? 0)
        ? node.label
        : existing.label,
    aliases: Array.from(
      new Set([...existing.aliases, ...node.aliases].filter(Boolean))
    ),
    properties: { ...existing.properties, ...node.properties },
  })
}

function ensureEdge(
  edgesById: Map<string, DoxaGraphEdge>,
  edge: DoxaGraphEdge
): void {
  if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge)
}

function neighborsByType(
  nodeId: string,
  edges: DoxaGraphEdge[],
  type: DoxaGraphEdge['type'],
  toward: 'source' | 'target'
): string[] {
  const out: string[] = []
  for (const e of edges) {
    if (e.type !== type) continue
    if (toward === 'target' && e.source === nodeId) out.push(e.target)
    if (toward === 'source' && e.target === nodeId) out.push(e.source)
  }
  return out
}

function pickPrimaryCommunity(counts: Map<string, number>): string | null {
  let best: string | null = null
  let bestN = 0
  for (const [id, n] of counts) {
    if (!isIslandCommunityId(id)) continue
    if (n > bestN || (n === bestN && best && id < best)) {
      best = id
      bestN = n
    }
  }
  return bestN > 0 ? best : null
}

function communityKindOf(
  id: string
): NeoGraphCommunity['kind'] {
  if (id.startsWith('controversy:')) return 'controversy'
  if (id.startsWith('publication:')) return 'publication'
  if (id === COMMUNITY_BRIDGE) return 'bridge'
  return 'unlinked'
}

function stamp(
  node: DoxaGraphNode,
  communityId: string,
  labels: Map<string, string>,
  islandSpan?: number
): DoxaGraphNode {
  const communityLabel =
    labels.get(communityId) ??
    (communityId === COMMUNITY_BRIDGE
      ? 'Bridge'
      : communityId === COMMUNITY_UNLINKED
        ? 'Unlinked'
        : communityId)
  return {
    ...node,
    communityId,
    communityLabel,
    properties: {
      ...node.properties,
      communityId,
      communityLabel,
      ...(typeof islandSpan === 'number' && islandSpan > 0
        ? { islandSpan }
        : {}),
    },
  }
}

export function mergeOntologyOverlay(
  base: DoxaGraphProjection,
  overlay: UnionOntologyOverlay
): DoxaGraphProjection {
  const nodesById = new Map(base.nodes.map((n) => [n.id, { ...n }]))
  const edgesById = new Map(base.edges.map((e) => [e.id, { ...e }]))

  for (const c of overlay.controversies) {
    ensureNode(nodesById, {
      id: nodeId('controversy', c.uid),
      kind: 'controversy',
      label: truncate(controversyDisplayLabel(c.title), 80),
      aliases: [c.uid],
      degreeHint: 0,
      properties: {
        uid: c.uid,
        title: c.title,
      },
    })
  }

  for (const v of overlay.viewpoints) {
    ensureNode(nodesById, {
      id: nodeId('viewpoint', v.uid),
      kind: 'viewpoint',
      label: truncate(v.label || 'Viewpoint', 80),
      aliases: [v.uid],
      degreeHint: 0,
      properties: {
        uid: v.uid,
        label: v.label,
      },
    })
  }

  for (const d of overlay.disputes) {
    ensureNode(nodesById, {
      id: nodeId('dispute', d.uid),
      kind: 'dispute',
      label: truncate(d.label || 'Dispute', 80),
      aliases: [d.uid],
      degreeHint: 0,
      properties: {
        uid: d.uid,
        label: d.label,
        disputeType: d.disputeType,
      },
    })
  }

  for (const e of overlay.includes) {
    const source = nodeId('controversy', e.fromUid)
    const target = nodeId('viewpoint', e.toUid)
    if (!nodesById.has(source) || !nodesById.has(target)) continue
    ensureEdge(edgesById, {
      id: edgeId('INCLUDES', source, target),
      source,
      target,
      type: 'INCLUDES',
      label: 'INCLUDES',
      properties: {},
    })
  }

  for (const e of overlay.advances) {
    const source = nodeId('viewpoint', e.fromUid)
    const target = nodeId('proposition', e.toUid)
    if (!nodesById.has(source) || !nodesById.has(target)) continue
    ensureEdge(edgesById, {
      id: edgeId('ADVANCES', source, target),
      source,
      target,
      type: 'ADVANCES',
      label: 'ADVANCES',
      properties: {},
    })
  }

  for (const e of overlay.concerns) {
    const source = nodeId('dispute', e.fromUid)
    const target = nodeId('proposition', e.toUid)
    if (!nodesById.has(source) || !nodesById.has(target)) continue
    ensureEdge(edgesById, {
      id: edgeId('CONCERNS', source, target),
      source,
      target,
      type: 'CONCERNS',
      label: 'CONCERNS',
      properties: {},
    })
  }

  for (const e of overlay.relatesTo) {
    const source = nodeId('proposition', e.fromUid)
    const target = nodeId('proposition', e.toUid)
    if (!nodesById.has(source) || !nodesById.has(target)) continue
    if (source === target) continue
    ensureEdge(edgesById, {
      id: edgeId('RELATES_TO', source, target),
      source,
      target,
      type: 'RELATES_TO',
      label: 'RELATES_TO',
      properties: {},
    })
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

  return {
    ...base,
    nodes,
    edges: Array.from(edgesById.values()),
  }
}

export function assignOntologyCommunities(
  projection: DoxaGraphProjection,
  overlay: UnionOntologyOverlay
): DoxaGraphProjection {
  const labels = new Map<string, string>([
    [COMMUNITY_UNLINKED, 'Unlinked'],
    [COMMUNITY_BRIDGE, 'Bridge'],
  ])
  for (const c of overlay.controversies) {
    labels.set(
      controversyCommunityId(c.uid),
      controversyDisplayLabel(c.title)
    )
  }

  const viewpointToControversy = new Map<string, string>()
  for (const e of overlay.includes) {
    viewpointToControversy.set(
      nodeId('viewpoint', e.toUid),
      controversyCommunityId(e.fromUid)
    )
  }

  const propositionCounts = new Map<string, Map<string, number>>()
  const bumpProp = (propId: string, communityId: string) => {
    let counts = propositionCounts.get(propId)
    if (!counts) {
      counts = new Map()
      propositionCounts.set(propId, counts)
    }
    counts.set(communityId, (counts.get(communityId) ?? 0) + 1)
  }
  for (const e of overlay.advances) {
    const vpId = nodeId('viewpoint', e.fromUid)
    const communityId = viewpointToControversy.get(vpId)
    if (!communityId) continue
    bumpProp(nodeId('proposition', e.toUid), communityId)
  }

  const assigned = new Map<string, string>()
  const islandSpans = new Map<string, number>()
  const setIf = (id: string, communityId: string | null | undefined) => {
    if (!communityId || assigned.has(id)) return
    assigned.set(id, communityId)
  }

  for (const node of projection.nodes) {
    if (node.kind === 'controversy') {
      const uid = uidOf(node)
      if (uid) {
        const id = controversyCommunityId(uid)
        labels.set(id, node.label || labels.get(id) || 'Controversy')
        assigned.set(node.id, id)
      }
    }
    if (node.kind === 'viewpoint') {
      const communityId = viewpointToControversy.get(node.id)
      if (communityId) assigned.set(node.id, communityId)
    }
  }

  for (const node of projection.nodes) {
    if (node.kind !== 'proposition') continue
    const primary = pickPrimaryCommunity(
      propositionCounts.get(node.id) ?? new Map()
    )
    setIf(node.id, primary)
  }

  for (const node of projection.nodes) {
    if (node.kind !== 'dispute') continue
    const counts = new Map<string, number>()
    for (const propId of neighborsByType(
      node.id,
      projection.edges,
      'CONCERNS',
      'target'
    )) {
      const c = assigned.get(propId)
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    setIf(node.id, pickPrimaryCommunity(counts))
  }

  for (const node of projection.nodes) {
    if (node.kind !== 'utterance') continue
    const counts = new Map<string, number>()
    for (const propId of neighborsByType(
      node.id,
      projection.edges,
      'EXPRESSES',
      'target'
    )) {
      const c = assigned.get(propId)
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    setIf(node.id, pickPrimaryCommunity(counts))
  }

  for (const node of projection.nodes) {
    if (node.kind !== 'argument') continue
    const counts = new Map<string, number>()
    for (const propId of neighborsByType(
      node.id,
      projection.edges,
      'HAS_ROLE',
      'target'
    )) {
      const c = assigned.get(propId)
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    setIf(node.id, pickPrimaryCommunity(counts))
  }

  const docPub = new Map<string, string>()
  for (const edge of projection.edges) {
    if (edge.type !== 'PUBLISHED_BY') continue
    const pub = projection.nodes.find((n) => n.id === edge.target)
    const uid = pub && pub.kind === 'publication' ? uidOf(pub) : null
    if (uid) docPub.set(edge.source, publicationCommunityId(uid))
  }
  for (const node of projection.nodes) {
    if (node.kind !== 'publication') continue
    const uid = uidOf(node)
    if (uid) {
      const id = publicationCommunityId(uid)
      labels.set(id, node.label || 'Publication')
    }
  }

  for (const node of projection.nodes) {
    if (node.kind !== 'document') continue
    const counts = new Map<string, number>()
    for (const other of projection.nodes) {
      if (other.kind !== 'utterance') continue
      if (documentUidOf(other) !== uidOf(node)) continue
      const c = assigned.get(other.id)
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    const primary = pickPrimaryCommunity(counts)
    if (primary) {
      assigned.set(node.id, primary)
    } else {
      const pubCommunity = docPub.get(node.id)
      assigned.set(node.id, pubCommunity ?? COMMUNITY_UNLINKED)
    }
  }

  for (const node of projection.nodes) {
    if (
      node.kind !== 'segment' &&
      node.kind !== 'agent' &&
      node.kind !== 'utterance' &&
      node.kind !== 'argument'
    ) {
      continue
    }
    const docUid = documentUidOf(node)
    if (docUid) {
      const docCommunity = assigned.get(nodeId('document', docUid))
      setIf(node.id, docCommunity)
    }
  }

  for (const node of projection.nodes) {
    if (assigned.has(node.id)) continue
    if (node.kind === 'publication') {
      const counts = new Map<string, number>()
      for (const edge of projection.edges) {
        if (edge.type !== 'PUBLISHED_BY' || edge.target !== node.id) continue
        const c = assigned.get(edge.source)
        if (isIslandCommunityId(c)) {
          counts.set(c as string, (counts.get(c as string) ?? 0) + 1)
        }
      }
      if (counts.size > 0) islandSpans.set(node.id, counts.size)
      const primary = pickPrimaryCommunity(counts)
      if (primary) {
        assigned.set(node.id, primary)
      } else {
        const uid = uidOf(node)
        assigned.set(
          node.id,
          uid ? publicationCommunityId(uid) : COMMUNITY_UNLINKED
        )
      }
      continue
    }
    if (node.kind === 'entity') {
      const counts = new Map<string, number>()
      for (const edge of projection.edges) {
        const other =
          edge.source === node.id
            ? edge.target
            : edge.target === node.id
              ? edge.source
              : null
        if (!other) continue
        const c = assigned.get(other)
        if (isIslandCommunityId(c)) {
          counts.set(c as string, (counts.get(c as string) ?? 0) + 1)
        }
      }
      if (counts.size > 0) islandSpans.set(node.id, counts.size)
      const primary = pickPrimaryCommunity(counts)
      assigned.set(node.id, primary ?? COMMUNITY_UNLINKED)
      continue
    }
    assigned.set(node.id, COMMUNITY_UNLINKED)
  }

  const nodes = projection.nodes.map((n) =>
    stamp(
      n,
      assigned.get(n.id) ?? COMMUNITY_UNLINKED,
      labels,
      islandSpans.get(n.id)
    )
  )

  const counts = new Map<string, number>()
  for (const n of nodes) {
    const id = n.communityId ?? COMMUNITY_UNLINKED
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const communities: NeoGraphCommunity[] = [...counts.entries()]
    .map(([id, memberCount]) => ({
      id,
      label: labels.get(id) ?? id,
      kind: communityKindOf(id),
      memberCount,
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.id.localeCompare(b.id))

  return {
    ...projection,
    nodes,
    communities,
  }
}

export function projectUnionOntology(
  graphs: NeoDocumentGraph[],
  overlay: UnionOntologyOverlay = emptyUnionOntologyOverlay(),
  options?: { missingIds?: string[] }
): DoxaGraphProjection {
  const base = projectUnionDocuments(graphs, options)
  const merged = mergeOntologyOverlay(base, overlay)
  const withCommunities = assignOntologyCommunities(merged, overlay)
  return {
    ...withCommunities,
    projectionId: 'union-ontology',
    rootId: 'union',
    rootKind: 'union',
  }
}
