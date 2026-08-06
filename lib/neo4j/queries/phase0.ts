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

export async function getDocumentGraph(
  storyId: string
): Promise<NeoDocumentGraph | null> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (d:Document {uid: $storyId})
      OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
      OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
      OPTIONAL MATCH (u:Utterance {documentUid: $storyId})-[:GROUNDED_IN]->(gseg:Segment)
      OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
      OPTIONAL MATCH (u)-[gi:GROUNDED_IN]->(gseg)
      WITH d, p,
           collect(DISTINCT seg) AS segs,
           collect(DISTINCT {
             uid: u.uid,
             text: u.text,
             speechAct: u.speechAct,
             attributionMode: u.attributionMode,
             polarity: u.polarity,
             modality: u.modality,
             confidence: u.confidence,
             explicit: u.explicit,
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
      { storyId }
    )

    const record = result.records[0]
    if (!record) return null

    const d = record.get('d')?.properties ?? {}
    const p = record.get('p')?.properties ?? null
    const segs = (record.get('segs') as Array<{ properties: Record<string, unknown> }>) ?? []
    const utts = (record.get('utts') as Array<Record<string, unknown>>) ?? []

    const segments: NeoSegment[] = segs
      .filter((s) => s?.properties?.uid)
      .map((s) => ({
        uid: String(s.properties.uid),
        ord: asNumber(s.properties.ord),
        text: String(s.properties.text ?? ''),
        charStart: asNumber(s.properties.charStart),
        charEnd: asNumber(s.properties.charEnd),
      }))
      .sort((a, b) => a.ord - b.ord)

    const agentsByUid = new Map<string, NeoAgent>()
    const utterances: NeoUtterance[] = []

    for (const raw of utts) {
      if (!raw?.uid) continue
      const agentUid = asString(raw.agentUid)
      if (agentUid && !agentsByUid.has(agentUid)) {
        agentsByUid.set(agentUid, {
          uid: agentUid,
          name: asString(raw.agentName),
          normalizedName: asString(raw.agentNormalizedName),
        })
      }
      utterances.push({
        uid: String(raw.uid),
        text: String(raw.text ?? ''),
        speechAct: asString(raw.speechAct),
        attributionMode: asString(raw.attributionMode),
        polarity: asString(raw.polarity),
        modality: asString(raw.modality),
        confidence:
          raw.confidence == null ? null : asNumber(raw.confidence, NaN) || null,
        explicit: typeof raw.explicit === 'boolean' ? raw.explicit : null,
        documentUid: String(raw.documentUid ?? storyId),
        segmentUid: String(raw.segmentUid ?? ''),
        charStart: asNumber(raw.charStart),
        charEnd: asNumber(raw.charEnd),
        agentUid,
        agentName: asString(raw.agentName),
      })
    }

    utterances.sort((a, b) => a.charStart - b.charStart || a.uid.localeCompare(b.uid))

    const countsResult = await session.run(
      `
      MATCH (u:Utterance {documentUid: $storyId})
      OPTIONAL MATCH (u)-[ex:EXPRESSES]->(p:Proposition)
      OPTIONAL MATCH (u)-[:MENTIONS]->(e:Entity)
      WITH count(DISTINCT p) AS propositionCount,
           count(DISTINCT e) AS entityCount,
           count(DISTINCT ex) AS expressesCount
      OPTIONAL MATCH (arg:Argument {documentUid: $storyId})
      OPTIONAL MATCH (arg)-[hr:HAS_ROLE]->(:Proposition)
      RETURN propositionCount, entityCount, expressesCount,
             count(DISTINCT arg) AS argumentCount,
             count(DISTINCT hr) AS hasRoleCount
      `,
      { storyId }
    )
    const counts = countsResult.records[0]
    const phase1 = {
      propositionCount: asNumber(counts?.get('propositionCount')),
      entityCount: asNumber(counts?.get('entityCount')),
      expressesCount: asNumber(counts?.get('expressesCount')),
    }
    const phase2 = {
      argumentCount: asNumber(counts?.get('argumentCount')),
      hasRoleCount: asNumber(counts?.get('hasRoleCount')),
    }

    const officeResult = await session.run(
      `
      MATCH (u:Utterance {documentUid: $storyId})-[:ASSERTED_BY]->(a:Agent)
      MATCH (a)-[r:REFERRED_AS {documentUid: $storyId}]->(office:Entity)
      RETURN DISTINCT
        a.uid AS fromUid,
        'agent' AS fromKind,
        office.uid AS officeUid,
        office.name AS officeName,
        office.normalizedName AS officeNorm,
        office.kindHint AS kindHint,
        r.title AS title
      UNION
      MATCH (u:Utterance {documentUid: $storyId})-[:MENTIONS]->(person:Entity)
      MATCH (person)-[r:REFERRED_AS {documentUid: $storyId}]->(office:Entity)
      WHERE coalesce(person.kindHint, '') <> 'office'
      RETURN DISTINCT
        person.uid AS fromUid,
        'entity' AS fromKind,
        office.uid AS officeUid,
        office.name AS officeName,
        office.normalizedName AS officeNorm,
        office.kindHint AS kindHint,
        r.title AS title
      `,
      { storyId }
    )

    const mentionResult = await session.run(
      `
      MATCH (u:Utterance {documentUid: $storyId})-[m:MENTIONS]->(e:Entity)
      RETURN DISTINCT
        u.uid AS utteranceUid,
        e.uid AS entityUid,
        e.name AS name,
        e.normalizedName AS normalizedName,
        e.kindHint AS kindHint,
        m.surfaceForm AS surfaceForm,
        m.title AS title
      `,
      { storyId }
    )

    const entitiesByUid = new Map<string, NeoEntity>()
    const referredAs: NeoReferredAs[] = []
    for (const rec of officeResult.records) {
      const officeUid = asString(rec.get('officeUid'))
      const fromUid = asString(rec.get('fromUid'))
      const fromKindRaw = asString(rec.get('fromKind'))
      const fromKind = fromKindRaw === 'entity' ? 'entity' : 'agent'
      if (!officeUid || !fromUid) continue
      if (!entitiesByUid.has(officeUid)) {
        entitiesByUid.set(officeUid, {
          uid: officeUid,
          name: asString(rec.get('officeName')),
          normalizedName: asString(rec.get('officeNorm')),
          kindHint: asString(rec.get('kindHint')) ?? 'office',
        })
      }
      referredAs.push({
        fromUid,
        fromKind,
        officeUid,
        title: asString(rec.get('title')),
      })
    }

    const mentions: NeoMention[] = []
    for (const rec of mentionResult.records) {
      const utteranceUid = asString(rec.get('utteranceUid'))
      const entityUid = asString(rec.get('entityUid'))
      if (!utteranceUid || !entityUid) continue
      if (!entitiesByUid.has(entityUid)) {
        entitiesByUid.set(entityUid, {
          uid: entityUid,
          name: asString(rec.get('name')),
          normalizedName: asString(rec.get('normalizedName')),
          kindHint: asString(rec.get('kindHint')),
        })
      }
      mentions.push({
        utteranceUid,
        entityUid,
        surfaceForm: asString(rec.get('surfaceForm')),
        title: asString(rec.get('title')),
      })
    }

    const propResult = await session.run(
      `
      MATCH (u:Utterance {documentUid: $storyId})-[:EXPRESSES]->(p:Proposition)
      RETURN DISTINCT
        p.uid AS uid,
        p.text AS text,
        p.certainty AS certainty,
        p.timeframe AS timeframe,
        p.scope AS scope,
        u.uid AS utteranceUid
      `,
      { storyId }
    )
    const propositionsByUid = new Map<string, NeoProposition>()
    const expresses: NeoExpresses[] = []
    for (const rec of propResult.records) {
      const uid = asString(rec.get('uid'))
      const utteranceUid = asString(rec.get('utteranceUid'))
      if (!uid || !utteranceUid) continue
      if (!propositionsByUid.has(uid)) {
        propositionsByUid.set(uid, {
          uid,
          text: String(rec.get('text') ?? ''),
          certainty: asString(rec.get('certainty')),
          timeframe: asString(rec.get('timeframe')),
          scope: asString(rec.get('scope')),
        })
      }
      expresses.push({ utteranceUid, propositionUid: uid })
    }

    const argResult = await session.run(
      `
      MATCH (arg:Argument {documentUid: $storyId})-[hr:HAS_ROLE]->(p:Proposition)
      RETURN arg.uid AS argUid,
             arg.summary AS summary,
             p.uid AS propUid,
             hr.role AS role
      `,
      { storyId }
    )
    const argumentsByUid = new Map<string, NeoArgument>()
    const hasRoles: NeoHasRole[] = []
    for (const rec of argResult.records) {
      const argUid = asString(rec.get('argUid'))
      const propUid = asString(rec.get('propUid'))
      if (!argUid || !propUid) continue
      if (!argumentsByUid.has(argUid)) {
        argumentsByUid.set(argUid, {
          uid: argUid,
          summary: asString(rec.get('summary')),
        })
      }
      // Ensure role-target props appear even if EXPRESSES was missing
      if (!propositionsByUid.has(propUid)) {
        propositionsByUid.set(propUid, {
          uid: propUid,
          text: '',
          certainty: null,
          timeframe: null,
          scope: null,
        })
      }
      hasRoles.push({
        argumentUid: argUid,
        propositionUid: propUid,
        role: asString(rec.get('role')),
      })
    }

    // Fill stub proposition text if Argument linked props lacked EXPRESSES rows
    const stubPropUids = Array.from(propositionsByUid.values())
      .filter((p) => !p.text)
      .map((p) => p.uid)
    if (stubPropUids.length > 0) {
      const fillResult = await session.run(
        `
        MATCH (p:Proposition)
        WHERE p.uid IN $uids
        RETURN p.uid AS uid, p.text AS text,
               p.certainty AS certainty,
               p.timeframe AS timeframe,
               p.scope AS scope
        `,
        { uids: stubPropUids }
      )
      for (const rec of fillResult.records) {
        const uid = asString(rec.get('uid'))
        if (!uid || !propositionsByUid.has(uid)) continue
        propositionsByUid.set(uid, {
          uid,
          text: String(rec.get('text') ?? ''),
          certainty: asString(rec.get('certainty')),
          timeframe: asString(rec.get('timeframe')),
          scope: asString(rec.get('scope')),
        })
      }
    }

    return {
      document: {
        uid: String(d.uid ?? storyId),
        title: asString(d.title),
        publishedAt: asString(d.publishedAt),
        url: asString(d.url),
        schemaVersion: asString(d.schemaVersion),
        extractorVersion: asString(d.extractorVersion),
      },
      publication: p
        ? {
            uid: String(p.uid ?? ''),
            name: asString(p.name),
          }
        : null,
      segments,
      utterances,
      agents: Array.from(agentsByUid.values()).sort((a, b) =>
        (a.name ?? a.uid).localeCompare(b.name ?? b.uid)
      ),
      entities: Array.from(entitiesByUid.values()).sort((a, b) =>
        (a.name ?? a.uid).localeCompare(b.name ?? b.uid)
      ),
      referredAs,
      mentions,
      propositions: Array.from(propositionsByUid.values()).sort((a, b) =>
        a.uid.localeCompare(b.uid)
      ),
      expresses,
      arguments: Array.from(argumentsByUid.values()).sort((a, b) =>
        a.uid.localeCompare(b.uid)
      ),
      hasRoles,
      phase1,
      phase2,
    }
  })
}
