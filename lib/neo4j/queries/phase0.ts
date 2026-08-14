import { withNeo4jSession } from '@/lib/neo4j/server'

export type NeoPublication = {
  uid: string
  name: string | null
}

export type NeoDocument = {
  uid: string
  title: string | null
  publishedAt: string | null
  url: string | null
  schemaVersion: string | null
  extractorVersion: string | null
}

export type NeoSegment = {
  uid: string
  ord: number
  text: string
  charStart: number
  charEnd: number
}

export type NeoAgent = {
  uid: string
  name: string | null
  normalizedName: string | null
}

export type NeoEntity = {
  uid: string
  name: string | null
  normalizedName: string | null
  kindHint: string | null
}

/** Agent or person-Entity → office Entity title link. */
export type NeoReferredAs = {
  fromUid: string
  fromKind: 'agent' | 'entity'
  officeUid: string
  title: string | null
}

/** Utterance → Entity (person/office/org) from Phase 1 ER. */
export type NeoMention = {
  utteranceUid: string
  entityUid: string
  surfaceForm: string | null
  title: string | null
}

/** Phase 1 Proposition linked from an utterance via EXPRESSES. */
export type NeoProposition = {
  uid: string
  text: string
  certainty: string | null
  timeframe: string | null
  scope: string | null
}

/** Utterance → Proposition. */
export type NeoExpresses = {
  utteranceUid: string
  propositionUid: string
}

/** Phase 2a Argument hyperedge over propositions. */
export type NeoArgument = {
  uid: string
  summary: string | null
}

/** Argument → Proposition role membership. */
export type NeoHasRole = {
  argumentUid: string
  propositionUid: string
  role: string | null
}

export type NeoUtterance = {
  uid: string
  text: string
  speechAct: string | null
  attributionMode: string | null
  polarity: string | null
  modality: string | null
  confidence: number | null
  explicit: boolean | null
  documentUid: string
  segmentUid: string
  charStart: number
  charEnd: number
  agentUid: string | null
  agentName: string | null
}

export type NeoDocumentGraph = {
  document: NeoDocument
  publication: NeoPublication | null
  segments: NeoSegment[]
  utterances: NeoUtterance[]
  agents: NeoAgent[]
  entities: NeoEntity[]
  referredAs: NeoReferredAs[]
  mentions: NeoMention[]
  propositions: NeoProposition[]
  expresses: NeoExpresses[]
  arguments: NeoArgument[]
  hasRoles: NeoHasRole[]
  phase1: {
    propositionCount: number
    entityCount: number
    expressesCount: number
  }
  phase2: {
    argumentCount: number
    hasRoleCount: number
  }
}

/** Label / viz preview only — full text is fetched on node-detail click. */
const TEXT_PREVIEW_CHARS = 80

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function previewText(value: unknown): string {
  const raw = asString(value) ?? ''
  if (raw.length <= TEXT_PREVIEW_CHARS) return raw
  return `${raw.slice(0, TEXT_PREVIEW_CHARS - 1)}…`
}

function emptyGraph(storyId: string): NeoDocumentGraph {
  return {
    document: {
      uid: storyId,
      title: null,
      publishedAt: null,
      url: null,
      schemaVersion: null,
      extractorVersion: null,
    },
    publication: null,
    segments: [],
    utterances: [],
    agents: [],
    entities: [],
    referredAs: [],
    mentions: [],
    propositions: [],
    expresses: [],
    arguments: [],
    hasRoles: [],
    phase1: { propositionCount: 0, entityCount: 0, expressesCount: 0 },
    phase2: { argumentCount: 0, hasRoleCount: 0 },
  }
}

type GraphAcc = {
  graph: NeoDocumentGraph
  agentsByUid: Map<string, NeoAgent>
  entitiesByUid: Map<string, NeoEntity>
  propositionsByUid: Map<string, NeoProposition>
  argumentsByUid: Map<string, NeoArgument>
}

function ensureAcc(
  byId: Map<string, GraphAcc>,
  storyId: string
): GraphAcc {
  let acc = byId.get(storyId)
  if (acc) return acc
  acc = {
    graph: emptyGraph(storyId),
    agentsByUid: new Map(),
    entitiesByUid: new Map(),
    propositionsByUid: new Map(),
    argumentsByUid: new Map(),
  }
  byId.set(storyId, acc)
  return acc
}

function finalizeGraph(acc: GraphAcc): NeoDocumentGraph {
  const g = acc.graph
  g.agents = Array.from(acc.agentsByUid.values()).sort((a, b) =>
    (a.name ?? a.uid).localeCompare(b.name ?? b.uid)
  )
  g.entities = Array.from(acc.entitiesByUid.values()).sort((a, b) =>
    (a.name ?? a.uid).localeCompare(b.name ?? b.uid)
  )
  g.propositions = Array.from(acc.propositionsByUid.values()).sort((a, b) =>
    a.uid.localeCompare(b.uid)
  )
  g.arguments = Array.from(acc.argumentsByUid.values()).sort((a, b) =>
    a.uid.localeCompare(b.uid)
  )
  g.utterances.sort(
    (a, b) => a.charStart - b.charStart || a.uid.localeCompare(b.uid)
  )
  g.phase1 = {
    propositionCount: g.propositions.length,
    entityCount: g.entities.length,
    expressesCount: g.expresses.length,
  }
  g.phase2 = {
    argumentCount: g.arguments.length,
    hasRoleCount: g.hasRoles.length,
  }
  return g
}

/**
 * Fetch many document graphs in a handful of Cypher round-trips (not N×6).
 * Text fields are truncated for the viz payload; use getNeoNodeDetail for full copy.
 */
export async function getDocumentGraphs(
  storyIds: string[]
): Promise<Map<string, NeoDocumentGraph | null>> {
  const unique = [...new Set(storyIds.filter(Boolean))]
  const out = new Map<string, NeoDocumentGraph | null>()
  if (unique.length === 0) return out

  return withNeo4jSession(async (session) => {
    const byId = new Map<string, GraphAcc>()
    const uids = unique

    const core = await session.run(
      `
      MATCH (d:Document)
      WHERE d.uid IN $uids
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
      OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
      WITH d, p, collect(DISTINCT seg) AS segs
      OPTIONAL MATCH (u:Utterance {documentUid: d.uid})
      OPTIONAL MATCH (u)-[gi:GROUNDED_IN]->(gseg:Segment)
      OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
      WITH d, p, segs, collect(DISTINCT {
        uid: u.uid,
        text: substring(toString(coalesce(u.text, '')), 0, $preview),
        speechAct: u.speechAct,
        documentUid: u.documentUid,
        segmentUid: gseg.uid,
        charStart: gi.charStart,
        charEnd: gi.charEnd,
        agentUid: a.uid,
        agentName: a.name,
        agentNormalizedName: a.normalizedName
      }) AS utts
      RETURN d, p, segs, utts
      `,
      { uids, preview: TEXT_PREVIEW_CHARS }
    )

    for (const rec of core.records) {
      const d = rec.get('d')?.properties ?? {}
      const storyId = String(d.uid ?? '')
      if (!storyId) continue
      const acc = ensureAcc(byId, storyId)
      acc.graph.document = {
        uid: storyId,
        title: asString(d.title),
        publishedAt: asString(d.publishedAt),
        url: asString(d.url),
        schemaVersion: asString(d.schemaVersion),
        extractorVersion: asString(d.extractorVersion),
      }
      const p = rec.get('p')?.properties ?? null
      acc.graph.publication = p?.uid
        ? { uid: String(p.uid), name: asString(p.name) }
        : null

      const segs =
        (rec.get('segs') as Array<{ properties: Record<string, unknown> }>) ??
        []
      acc.graph.segments = segs
        .filter((s) => s?.properties?.uid)
        .map((s) => ({
          uid: String(s.properties.uid),
          ord: asNumber(s.properties.ord),
          text: previewText(s.properties.text),
          charStart: asNumber(s.properties.charStart),
          charEnd: asNumber(s.properties.charEnd),
        }))
        .sort((a, b) => a.ord - b.ord)

      const utts = (rec.get('utts') as Array<Record<string, unknown>>) ?? []
      for (const raw of utts) {
        if (!raw?.uid) continue
        const agentUid = asString(raw.agentUid)
        if (agentUid && !acc.agentsByUid.has(agentUid)) {
          acc.agentsByUid.set(agentUid, {
            uid: agentUid,
            name: asString(raw.agentName),
            normalizedName: asString(raw.agentNormalizedName),
          })
        }
        acc.graph.utterances.push({
          uid: String(raw.uid),
          text: previewText(raw.text),
          speechAct: asString(raw.speechAct),
          attributionMode: null,
          polarity: null,
          modality: null,
          confidence: null,
          explicit: null,
          documentUid: String(raw.documentUid ?? storyId),
          segmentUid: String(raw.segmentUid ?? ''),
          charStart: asNumber(raw.charStart),
          charEnd: asNumber(raw.charEnd),
          agentUid,
          agentName: asString(raw.agentName),
        })
      }
    }

    const mentions = await session.run(
      `
      MATCH (u:Utterance)-[m:MENTIONS]->(e:Entity)
      WHERE u.documentUid IN $uids
      RETURN DISTINCT
        u.documentUid AS documentUid,
        u.uid AS utteranceUid,
        e.uid AS entityUid,
        e.name AS name,
        e.normalizedName AS normalizedName,
        e.kindHint AS kindHint,
        m.surfaceForm AS surfaceForm,
        m.title AS title
      `,
      { uids }
    )
    for (const rec of mentions.records) {
      const storyId = asString(rec.get('documentUid'))
      const utteranceUid = asString(rec.get('utteranceUid'))
      const entityUid = asString(rec.get('entityUid'))
      if (!storyId || !utteranceUid || !entityUid) continue
      const acc = ensureAcc(byId, storyId)
      if (!acc.entitiesByUid.has(entityUid)) {
        acc.entitiesByUid.set(entityUid, {
          uid: entityUid,
          name: asString(rec.get('name')),
          normalizedName: asString(rec.get('normalizedName')),
          kindHint: asString(rec.get('kindHint')),
        })
      }
      acc.graph.mentions.push({
        utteranceUid,
        entityUid,
        surfaceForm: asString(rec.get('surfaceForm')),
        title: asString(rec.get('title')),
      })
    }

    const offices = await session.run(
      `
      MATCH (u:Utterance)-[:ASSERTED_BY]->(a:Agent)
      WHERE u.documentUid IN $uids
      MATCH (a)-[r:REFERRED_AS]->(office:Entity)
      WHERE r.documentUid IN $uids
      RETURN DISTINCT
        u.documentUid AS documentUid,
        a.uid AS fromUid,
        'agent' AS fromKind,
        office.uid AS officeUid,
        office.name AS officeName,
        office.normalizedName AS officeNorm,
        office.kindHint AS kindHint,
        r.title AS title
      UNION
      MATCH (u:Utterance)-[:MENTIONS]->(person:Entity)
      WHERE u.documentUid IN $uids
      MATCH (person)-[r:REFERRED_AS]->(office:Entity)
      WHERE r.documentUid IN $uids
        AND coalesce(person.kindHint, '') <> 'office'
      RETURN DISTINCT
        u.documentUid AS documentUid,
        person.uid AS fromUid,
        'entity' AS fromKind,
        office.uid AS officeUid,
        office.name AS officeName,
        office.normalizedName AS officeNorm,
        office.kindHint AS kindHint,
        r.title AS title
      `,
      { uids }
    )
    const seenRef = new Set<string>()
    for (const rec of offices.records) {
      const storyId = asString(rec.get('documentUid'))
      const officeUid = asString(rec.get('officeUid'))
      const fromUid = asString(rec.get('fromUid'))
      if (!storyId || !officeUid || !fromUid) continue
      const fromKind =
        asString(rec.get('fromKind')) === 'entity' ? 'entity' : 'agent'
      const key = `${storyId}|${fromKind}|${fromUid}|${officeUid}`
      if (seenRef.has(key)) continue
      seenRef.add(key)
      const acc = ensureAcc(byId, storyId)
      if (!acc.entitiesByUid.has(officeUid)) {
        acc.entitiesByUid.set(officeUid, {
          uid: officeUid,
          name: asString(rec.get('officeName')),
          normalizedName: asString(rec.get('officeNorm')),
          kindHint: asString(rec.get('kindHint')) ?? 'office',
        })
      }
      acc.graph.referredAs.push({
        fromUid,
        fromKind,
        officeUid,
        title: asString(rec.get('title')),
      })
    }

    const props = await session.run(
      `
      MATCH (u:Utterance)-[:EXPRESSES]->(p:Proposition)
      WHERE u.documentUid IN $uids
      RETURN DISTINCT
        u.documentUid AS documentUid,
        u.uid AS utteranceUid,
        p.uid AS uid,
        substring(toString(coalesce(p.text, '')), 0, $preview) AS text,
        p.certainty AS certainty,
        p.timeframe AS timeframe,
        p.scope AS scope
      `,
      { uids, preview: TEXT_PREVIEW_CHARS }
    )
    for (const rec of props.records) {
      const storyId = asString(rec.get('documentUid'))
      const uid = asString(rec.get('uid'))
      const utteranceUid = asString(rec.get('utteranceUid'))
      if (!storyId || !uid || !utteranceUid) continue
      const acc = ensureAcc(byId, storyId)
      if (!acc.propositionsByUid.has(uid)) {
        acc.propositionsByUid.set(uid, {
          uid,
          text: previewText(rec.get('text')),
          certainty: asString(rec.get('certainty')),
          timeframe: asString(rec.get('timeframe')),
          scope: asString(rec.get('scope')),
        })
      }
      acc.graph.expresses.push({ utteranceUid, propositionUid: uid })
    }

    const args = await session.run(
      `
      MATCH (arg:Argument)-[hr:HAS_ROLE]->(p:Proposition)
      WHERE arg.documentUid IN $uids
      RETURN
        arg.documentUid AS documentUid,
        arg.uid AS argUid,
        substring(toString(coalesce(arg.summary, '')), 0, $preview) AS summary,
        p.uid AS propUid,
        substring(toString(coalesce(p.text, '')), 0, $preview) AS propText,
        p.certainty AS certainty,
        p.timeframe AS timeframe,
        p.scope AS scope,
        hr.role AS role
      `,
      { uids, preview: TEXT_PREVIEW_CHARS }
    )
    for (const rec of args.records) {
      const storyId = asString(rec.get('documentUid'))
      const argUid = asString(rec.get('argUid'))
      const propUid = asString(rec.get('propUid'))
      if (!storyId || !argUid || !propUid) continue
      const acc = ensureAcc(byId, storyId)
      if (!acc.argumentsByUid.has(argUid)) {
        acc.argumentsByUid.set(argUid, {
          uid: argUid,
          summary: previewText(rec.get('summary')) || null,
        })
      }
      if (!acc.propositionsByUid.has(propUid)) {
        acc.propositionsByUid.set(propUid, {
          uid: propUid,
          text: previewText(rec.get('propText')),
          certainty: asString(rec.get('certainty')),
          timeframe: asString(rec.get('timeframe')),
          scope: asString(rec.get('scope')),
        })
      }
      acc.graph.hasRoles.push({
        argumentUid: argUid,
        propositionUid: propUid,
        role: asString(rec.get('role')),
      })
    }

    for (const id of unique) {
      const acc = byId.get(id)
      out.set(id, acc ? finalizeGraph(acc) : null)
    }
    return out
  })
}

export async function getDocumentGraph(
  storyId: string
): Promise<NeoDocumentGraph | null> {
  const found = await getDocumentGraphs([storyId])
  return found.get(storyId) ?? null
}
