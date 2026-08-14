import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import type {
  DoxaGraphEdge,
  DoxaGraphNode,
  DoxaGraphProjection,
  NeoEdgeType,
} from '@/lib/admin/neo-graph/types'

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}…`
}

function nodeId(kind: string, uid: string): string {
  return `${kind}:${uid}`
}

/**
 * Maps the existing Phase 0 Neo4j DTO into a renderer-agnostic projection.
 * Does not query Neo4j; preserves stable ids derived from ontology uids.
 */
export function projectPhase0Document(
  graph: NeoDocumentGraph
): DoxaGraphProjection {
  const nodes: DoxaGraphNode[] = []
  const edges: DoxaGraphEdge[] = []
  const degree = new Map<string, number>()

  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)

  const docId = nodeId('document', graph.document.uid)
  nodes.push({
    id: docId,
    kind: 'document',
    label: truncate(graph.document.title || 'Document', 80),
    aliases: [graph.document.uid],
    degreeHint: 0,
      properties: {
        uid: graph.document.uid,
        title: graph.document.title,
      },
  })

  if (graph.publication?.uid) {
    const pubId = nodeId('publication', graph.publication.uid)
    nodes.push({
      id: pubId,
      kind: 'publication',
      label: truncate(graph.publication.name || 'Publication', 60),
      aliases: [graph.publication.uid],
      degreeHint: 0,
      properties: {
        uid: graph.publication.uid,
        name: graph.publication.name,
      },
    })
    const e: DoxaGraphEdge = {
      id: `${docId}->${pubId}:PUBLISHED_BY`,
      source: docId,
      target: pubId,
      type: 'PUBLISHED_BY',
      label: 'PUBLISHED_BY',
      properties: {},
    }
    edges.push(e)
    bump(docId)
    bump(pubId)
  }

  for (const seg of graph.segments) {
    if (!seg.uid) continue
    const segId = nodeId('segment', seg.uid)
    nodes.push({
      id: segId,
      kind: 'segment',
      label: truncate(seg.text || `Segment ${seg.ord}`, 48),
      aliases: [seg.uid, String(seg.ord)],
      degreeHint: 0,
      properties: {
        uid: seg.uid,
        ord: seg.ord,
        charStart: seg.charStart,
        charEnd: seg.charEnd,
      },
      charStart: seg.charStart,
      charEnd: seg.charEnd,
    })
    edges.push({
      id: `${docId}->${segId}:CONTAINS`,
      source: docId,
      target: segId,
      type: 'CONTAINS',
      label: 'CONTAINS',
      properties: { ord: seg.ord },
    })
    bump(docId)
    bump(segId)
  }

  for (const agent of graph.agents) {
    if (!agent.uid) continue
    const agentId = nodeId('agent', agent.uid)
    nodes.push({
      id: agentId,
      kind: 'agent',
      label: truncate(agent.name || agent.normalizedName || 'Agent', 48),
      aliases: [agent.uid, agent.normalizedName, agent.name].filter(
        (v): v is string => Boolean(v)
      ),
      degreeHint: 0,
      properties: {
        uid: agent.uid,
        name: agent.name,
        normalizedName: agent.normalizedName,
      },
    })
  }

  for (const ent of graph.entities ?? []) {
    if (!ent.uid) continue
    const entId = nodeId('entity', ent.uid)
    nodes.push({
      id: entId,
      kind: 'entity',
      label: truncate(ent.name || ent.normalizedName || 'Entity', 48),
      aliases: [ent.uid, ent.normalizedName, ent.name, ent.kindHint].filter(
        (v): v is string => Boolean(v)
      ),
      degreeHint: 0,
      properties: {
        uid: ent.uid,
        name: ent.name,
        normalizedName: ent.normalizedName,
        kindHint: ent.kindHint,
      },
    })
  }

  for (const ref of graph.referredAs ?? []) {
    if (!ref.fromUid || !ref.officeUid) continue
    const sourceId =
      ref.fromKind === 'entity'
        ? nodeId('entity', ref.fromUid)
        : nodeId('agent', ref.fromUid)
    const officeId = nodeId('entity', ref.officeUid)
    edges.push({
      id: `${sourceId}->${officeId}:REFERRED_AS`,
      source: sourceId,
      target: officeId,
      type: 'REFERRED_AS',
      label: ref.title ? `REFERRED_AS (${ref.title})` : 'REFERRED_AS',
      properties: { title: ref.title, fromKind: ref.fromKind },
    })
    bump(sourceId)
    bump(officeId)
  }

  for (const mention of graph.mentions ?? []) {
    if (!mention.utteranceUid || !mention.entityUid) continue
    const uttId = nodeId('utterance', mention.utteranceUid)
    const entId = nodeId('entity', mention.entityUid)
    edges.push({
      id: `${uttId}->${entId}:MENTIONS`,
      source: uttId,
      target: entId,
      type: 'MENTIONS',
      label: mention.title
        ? `MENTIONS (${mention.title})`
        : 'MENTIONS',
      properties: {
        surfaceForm: mention.surfaceForm,
        title: mention.title,
      },
    })
    bump(uttId)
    bump(entId)
  }

  for (const u of graph.utterances) {
    if (!u.uid) continue
    const uttId = nodeId('utterance', u.uid)
    nodes.push({
      id: uttId,
      kind: 'utterance',
      label: truncate(u.text || 'Utterance', 72),
      aliases: [u.uid, u.agentName].filter(
        (v): v is string => Boolean(v)
      ),
      degreeHint: 0,
      properties: {
        uid: u.uid,
        documentUid: u.documentUid,
        segmentUid: u.segmentUid,
        agentUid: u.agentUid,
        agentName: u.agentName,
      },
      charStart: u.charStart,
      charEnd: u.charEnd,
    })

    if (u.segmentUid) {
      const segId = nodeId('segment', u.segmentUid)
      const type: NeoEdgeType = 'GROUNDED_IN'
      edges.push({
        id: `${uttId}->${segId}:${type}`,
        source: uttId,
        target: segId,
        type,
        label: type,
        properties: {
          charStart: u.charStart,
          charEnd: u.charEnd,
        },
      })
      bump(uttId)
      bump(segId)
    } else {
      edges.push({
        id: `${uttId}->${docId}:GROUNDED_IN`,
        source: uttId,
        target: docId,
        type: 'GROUNDED_IN',
        label: 'GROUNDED_IN',
        properties: {
          charStart: u.charStart,
          charEnd: u.charEnd,
        },
      })
      bump(uttId)
      bump(docId)
    }

    if (u.agentUid) {
      const agentId = nodeId('agent', u.agentUid)
      edges.push({
        id: `${uttId}->${agentId}:ASSERTED_BY`,
        source: uttId,
        target: agentId,
        type: 'ASSERTED_BY',
        label: 'ASSERTED_BY',
        properties: {},
      })
      bump(uttId)
      bump(agentId)
    }
  }

  for (const p of graph.propositions ?? []) {
    if (!p.uid) continue
    const propId = nodeId('proposition', p.uid)
    nodes.push({
      id: propId,
      kind: 'proposition',
      label: truncate(p.text || 'Proposition', 72),
      aliases: [p.uid].filter((v): v is string => Boolean(v)),
      degreeHint: 0,
      properties: {
        uid: p.uid,
      },
    })
  }

  for (const ex of graph.expresses ?? []) {
    if (!ex.utteranceUid || !ex.propositionUid) continue
    const uttId = nodeId('utterance', ex.utteranceUid)
    const propId = nodeId('proposition', ex.propositionUid)
    edges.push({
      id: `${uttId}->${propId}:EXPRESSES`,
      source: uttId,
      target: propId,
      type: 'EXPRESSES',
      label: 'EXPRESSES',
      properties: {},
    })
    bump(uttId)
    bump(propId)
  }

  for (const arg of graph.arguments ?? []) {
    if (!arg.uid) continue
    const argId = nodeId('argument', arg.uid)
    nodes.push({
      id: argId,
      kind: 'argument',
      label: truncate(arg.summary || 'Argument', 60),
      aliases: [arg.uid],
      degreeHint: 0,
      properties: {
        uid: arg.uid,
      },
    })
  }

  for (const hr of graph.hasRoles ?? []) {
    if (!hr.argumentUid || !hr.propositionUid) continue
    const argId = nodeId('argument', hr.argumentUid)
    const propId = nodeId('proposition', hr.propositionUid)
    edges.push({
      id: `${argId}->${propId}:HAS_ROLE`,
      source: argId,
      target: propId,
      type: 'HAS_ROLE',
      label: hr.role ? `HAS_ROLE (${hr.role})` : 'HAS_ROLE',
      properties: { role: hr.role },
    })
    bump(argId)
    bump(propId)
  }

  for (const n of nodes) {
    n.degreeHint = degree.get(n.id) ?? 0
  }

  return {
    projectionId: 'phase0-document',
    storyId: graph.document.uid,
    rootId: graph.document.uid,
    rootKind: 'document',
    title: graph.document.title,
    nodes,
    edges,
  }
}
