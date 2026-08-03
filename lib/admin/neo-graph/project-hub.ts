import type { NeoHubGraph, NeoHubEdge } from '@/lib/neo4j/queries/hub'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoEdgeType,
  NeoProjectionId,
} from '@/lib/admin/neo-graph/types'

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function nodeId(kind: string, uid: string): string {
  return `${kind}:${uid}`
}

function projectionIdFor(
  rootKind: NeoHubGraph['rootKind']
): NeoProjectionId {
  if (rootKind === 'controversy') return 'hub-controversy'
  if (rootKind === 'proposition') return 'hub-proposition'
  return 'hub-entity'
}

function edgeEndpoints(
  edge: NeoHubEdge
): { sourceKind: string; targetKind: string } | null {
  switch (edge.type) {
    case 'INCLUDES':
      return { sourceKind: 'controversy', targetKind: 'viewpoint' }
    case 'ADVANCES':
      return { sourceKind: 'viewpoint', targetKind: 'proposition' }
    case 'EXPRESSES':
      return { sourceKind: 'utterance', targetKind: 'proposition' }
    case 'ASSERTED_BY':
      return { sourceKind: 'utterance', targetKind: 'agent' }
    case 'GROUNDED_IN':
      return { sourceKind: 'utterance', targetKind: 'document' }
    case 'RELATES_TO':
      return { sourceKind: 'proposition', targetKind: 'proposition' }
    case 'HAS_ROLE':
      return { sourceKind: 'argument', targetKind: 'proposition' }
    case 'MENTIONS':
      return { sourceKind: 'utterance', targetKind: 'entity' }
    case 'REFERRED_AS':
      return { sourceKind: 'agent', targetKind: 'entity' }
    case 'CONCERNS':
      return { sourceKind: 'dispute', targetKind: 'proposition' }
    default:
      return null
  }
}

/**
 * Maps a hub Neo4j DTO into the Sigma-ready projection.
 * Does not query Neo4j; stable ids are `kind:uid`.
 */
export function projectHubGraph(graph: NeoHubGraph): DoxaGraphProjection {
  const nodes: DoxaGraphNode[] = []
  const edges: DoxaGraphEdge[] = []
  const degree = new Map<string, number>()
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)
  const seenNodes = new Set<string>()

  const addNode = (node: DoxaGraphNode) => {
    if (seenNodes.has(node.id)) return
    seenNodes.add(node.id)
    nodes.push(node)
  }

  if (graph.controversy) {
    addNode({
      id: nodeId('controversy', graph.controversy.uid),
      kind: 'controversy',
      label: truncate(graph.controversy.title || 'Controversy', 80),
      aliases: [graph.controversy.uid],
      degreeHint: 0,
      properties: {
        uid: graph.controversy.uid,
        title: graph.controversy.title,
        summary: graph.controversy.summary,
      },
    })
  } else if (graph.rootKind === 'controversy') {
    addNode({
      id: nodeId('controversy', graph.rootUid),
      kind: 'controversy',
      label: truncate(graph.title || 'Controversy', 80),
      aliases: [graph.rootUid],
      degreeHint: 0,
      properties: {
        uid: graph.rootUid,
        title: graph.title,
        summary: graph.summary,
      },
    })
  }

  for (const v of graph.viewpoints) {
    addNode({
      id: nodeId('viewpoint', v.uid),
      kind: 'viewpoint',
      label: truncate(v.label || 'Viewpoint', 60),
      aliases: [v.uid, v.label].filter((x): x is string => Boolean(x)),
      degreeHint: 0,
      properties: {
        uid: v.uid,
        label: v.label,
        summary: v.summary,
      },
    })
  }

  for (const p of graph.propositions) {
    addNode({
      id: nodeId('proposition', p.uid),
      kind: 'proposition',
      label: truncate(p.text || p.normalizedText || 'Proposition', 72),
      aliases: [p.uid, p.normalizedText, p.text].filter(
        (x): x is string => Boolean(x)
      ),
      degreeHint: 0,
      properties: {
        uid: p.uid,
        text: p.text,
        normalizedText: p.normalizedText,
        certainty: p.certainty,
      },
    })
  }

  for (const d of graph.documents) {
    addNode({
      id: nodeId('document', d.uid),
      kind: 'document',
      label: truncate(d.title || d.uid, 60),
      aliases: [d.uid, d.title].filter((x): x is string => Boolean(x)),
      degreeHint: 0,
      properties: {
        uid: d.uid,
        title: d.title,
        url: d.url,
      },
    })
  }

  for (const a of graph.agents) {
    addNode({
      id: nodeId('agent', a.uid),
      kind: 'agent',
      label: truncate(a.name || a.normalizedName || 'Agent', 48),
      aliases: [a.uid, a.name, a.normalizedName].filter(
        (x): x is string => Boolean(x)
      ),
      degreeHint: 0,
      properties: {
        uid: a.uid,
        name: a.name,
        normalizedName: a.normalizedName,
        documentUid: a.documentUid,
      },
    })
  }

  for (const e of graph.entities) {
    addNode({
      id: nodeId('entity', e.uid),
      kind: 'entity',
      label: truncate(e.name || e.normalizedName || 'Entity', 48),
      aliases: [e.uid, e.name, e.normalizedName, e.kindHint].filter(
        (x): x is string => Boolean(x)
      ),
      degreeHint: 0,
      properties: {
        uid: e.uid,
        name: e.name,
        normalizedName: e.normalizedName,
        kindHint: e.kindHint,
      },
    })
  }

  for (const arg of graph.arguments) {
    addNode({
      id: nodeId('argument', arg.uid),
      kind: 'argument',
      label: truncate(arg.summary || 'Argument', 60),
      aliases: [arg.uid],
      degreeHint: 0,
      properties: {
        uid: arg.uid,
        summary: arg.summary,
        documentUid: arg.documentUid,
      },
    })
  }

  for (const d of graph.disputes) {
    addNode({
      id: nodeId('dispute', d.uid),
      kind: 'dispute',
      label: truncate(d.label || d.disputeType || 'Dispute', 60),
      aliases: [d.uid, d.disputeType].filter((x): x is string => Boolean(x)),
      degreeHint: 0,
      properties: {
        uid: d.uid,
        label: d.label,
        disputeType: d.disputeType,
      },
    })
  }

  for (const u of graph.utterances) {
    addNode({
      id: nodeId('utterance', u.uid),
      kind: 'utterance',
      label: truncate(u.text || 'Utterance', 72),
      aliases: [u.uid, u.agentName, u.speechAct].filter(
        (x): x is string => Boolean(x)
      ),
      degreeHint: 0,
      properties: {
        uid: u.uid,
        text: u.text,
        speechAct: u.speechAct,
        attributionMode: u.attributionMode,
        polarity: u.polarity,
        confidence: u.confidence,
        documentUid: u.documentUid,
        segmentUid: u.segmentUid,
        agentUid: u.agentUid,
        agentName: u.agentName,
      },
      charStart: u.charStart,
      charEnd: u.charEnd,
    })
  }

  // Ensure entity hub root exists even with no utterances
  if (graph.rootKind === 'entity' && !seenNodes.has(nodeId('entity', graph.rootUid))) {
    const ent = graph.entities.find((e) => e.uid === graph.rootUid)
    addNode({
      id: nodeId('entity', graph.rootUid),
      kind: 'entity',
      label: truncate(ent?.name || graph.title || 'Entity', 48),
      aliases: [graph.rootUid],
      degreeHint: 0,
      properties: {
        uid: graph.rootUid,
        name: ent?.name ?? graph.title,
        normalizedName: ent?.normalizedName ?? null,
        kindHint: ent?.kindHint ?? null,
      },
    })
  }

  if (
    graph.rootKind === 'proposition' &&
    !seenNodes.has(nodeId('proposition', graph.rootUid))
  ) {
    addNode({
      id: nodeId('proposition', graph.rootUid),
      kind: 'proposition',
      label: truncate(graph.title || 'Proposition', 72),
      aliases: [graph.rootUid],
      degreeHint: 0,
      properties: {
        uid: graph.rootUid,
        text: graph.title,
      },
    })
  }

  const seenEdges = new Set<string>()
  for (const edge of graph.edges) {
    const ends = edgeEndpoints(edge)
    if (!ends) continue
    const source = nodeId(ends.sourceKind, edge.fromUid)
    const target = nodeId(ends.targetKind, edge.toUid)
    if (!seenNodes.has(source) || !seenNodes.has(target)) continue
    const type = edge.type as NeoEdgeType
    const id = `${source}->${target}:${type}`
    if (seenEdges.has(id)) continue
    seenEdges.add(id)
    const label =
      edge.type === 'HAS_ROLE' && edge.role
        ? `HAS_ROLE (${edge.role})`
        : edge.type === 'REFERRED_AS' && edge.title
          ? `REFERRED_AS (${edge.title})`
          : edge.type === 'RELATES_TO' && edge.label
            ? `RELATES_TO (${edge.label})`
            : type
    edges.push({
      id,
      source,
      target,
      type,
      label,
      properties: {
        role: edge.role ?? null,
        title: edge.title ?? null,
        relationshipType: edge.label ?? null,
      },
    })
    bump(source)
    bump(target)
  }

  for (const n of nodes) {
    n.degreeHint = degree.get(n.id) ?? 0
  }

  return {
    projectionId: projectionIdFor(graph.rootKind),
    storyId: null,
    rootId: graph.rootUid,
    rootKind: graph.rootKind,
    title: graph.title,
    nodes,
    edges,
    documents: graph.documents.map((d) => ({ uid: d.uid, title: d.title })),
    queryTruncated: graph.queryTruncated,
  }
}
