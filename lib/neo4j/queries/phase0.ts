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
      phase1,
      phase2,
    }
  })
}
