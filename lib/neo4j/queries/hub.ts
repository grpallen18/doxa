import { withNeo4jSession } from '@/lib/neo4j/server'

export const HUB_MAX_DOCUMENTS = 25
export const HUB_MAX_UTTERANCES = 200
export const HUB_MAX_PROPOSITIONS = 80
export const HUB_MAX_ARGUMENTS = 60
export const HUB_MAX_ENTITIES = 60

export type NeoHubRootKind = 'controversy' | 'proposition' | 'entity'

export type NeoHubDocument = {
  uid: string
  title: string | null
  url: string | null
}

export type NeoHubViewpoint = {
  uid: string
  label: string | null
  summary: string | null
}

export type NeoHubProposition = {
  uid: string
  text: string | null
  normalizedText: string | null
  certainty: string | null
}

export type NeoHubArgument = {
  uid: string
  documentUid: string | null
  summary: string | null
}

export type NeoHubDispute = {
  uid: string
  label: string | null
  disputeType: string | null
}

export type NeoHubEntity = {
  uid: string
  name: string | null
  normalizedName: string | null
  kindHint: string | null
}

export type NeoHubAgent = {
  uid: string
  name: string | null
  normalizedName: string | null
  documentUid: string | null
}

export type NeoHubUtterance = {
  uid: string
  text: string
  speechAct: string | null
  attributionMode: string | null
  polarity: string | null
  confidence: number | null
  documentUid: string
  segmentUid: string | null
  charStart: number
  charEnd: number
  agentUid: string | null
  agentName: string | null
}

export type NeoHubEdge = {
  type:
    | 'INCLUDES'
    | 'ADVANCES'
    | 'EXPRESSES'
    | 'ASSERTED_BY'
    | 'GROUNDED_IN'
    | 'RELATES_TO'
    | 'HAS_ROLE'
    | 'MENTIONS'
    | 'REFERRED_AS'
    | 'CONCERNS'
  fromUid: string
  toUid: string
  label?: string | null
  role?: string | null
  title?: string | null
}

export type NeoHubGraph = {
  rootKind: NeoHubRootKind
  rootUid: string
  title: string | null
  summary: string | null
  documents: NeoHubDocument[]
  viewpoints: NeoHubViewpoint[]
  propositions: NeoHubProposition[]
  arguments: NeoHubArgument[]
  disputes: NeoHubDispute[]
  entities: NeoHubEntity[]
  agents: NeoHubAgent[]
  utterances: NeoHubUtterance[]
  controversy: { uid: string; title: string | null; summary: string | null } | null
  edges: NeoHubEdge[]
  queryTruncated: boolean
  caps: {
    maxDocuments: number
    maxUtterances: number
    maxPropositions: number
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

function diversifyByDocument<T extends { documentUid: string }>(
  items: T[],
  maxTotal: number,
  maxDocs: number
): { kept: T[]; truncated: boolean } {
  const byDoc = new Map<string, T[]>()
  for (const item of items) {
    const list = byDoc.get(item.documentUid) ?? []
    list.push(item)
    byDoc.set(item.documentUid, list)
  }
  const docIds = Array.from(byDoc.keys()).slice(0, maxDocs)
  const truncatedDocs = byDoc.size > maxDocs || items.length > maxTotal
  const perDoc = Math.max(1, Math.floor(maxTotal / Math.max(1, docIds.length)))
  const kept: T[] = []
  for (const docId of docIds) {
    const list = byDoc.get(docId) ?? []
    kept.push(...list.slice(0, perDoc))
  }
  // Fill remaining slots round-robin
  let guard = 0
  while (kept.length < maxTotal && guard < items.length) {
    let added = false
    for (const docId of docIds) {
      if (kept.length >= maxTotal) break
      const list = byDoc.get(docId) ?? []
      const already = kept.filter((k) => k.documentUid === docId).length
      if (already < list.length) {
        kept.push(list[already])
        added = true
      }
    }
    if (!added) break
    guard += 1
  }
  return {
    kept: kept.slice(0, maxTotal),
    truncated: truncatedDocs || kept.length < items.length,
  }
}

type RawHubBundle = {
  controversy: { uid: string; title: string | null; summary: string | null } | null
  viewpoints: NeoHubViewpoint[]
  propositions: NeoHubProposition[]
  propositionUids: string[]
  includes: Array<{ fromUid: string; toUid: string }>
  advances: Array<{ fromUid: string; toUid: string }>
  title: string | null
  summary: string | null
  found: boolean
}

async function loadControversySpine(uid: string): Promise<RawHubBundle | null> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (c:Controversy {uid: $uid})
      OPTIONAL MATCH (c)-[:INCLUDES]->(v:Viewpoint)
      OPTIONAL MATCH (v)-[:ADVANCES]->(p:Proposition)
      WITH c,
           collect(DISTINCT v) AS vs,
           collect(DISTINCT p) AS ps,
           collect(DISTINCT {fromUid: c.uid, toUid: v.uid}) AS includes,
           collect(DISTINCT {fromUid: v.uid, toUid: p.uid}) AS advances
      RETURN c,
             [x IN vs WHERE x IS NOT NULL | x] AS viewpoints,
             [x IN ps WHERE x IS NOT NULL | x] AS propositions,
             [x IN includes WHERE x.toUid IS NOT NULL | x] AS includes,
             [x IN advances WHERE x.fromUid IS NOT NULL AND x.toUid IS NOT NULL | x] AS advances
      `,
      { uid }
    )
    const record = result.records[0]
    if (!record) return null
    const c = record.get('c')?.properties ?? {}
    const viewpointsRaw =
      (record.get('viewpoints') as Array<{ properties: Record<string, unknown> }>) ??
      []
    const propsRaw =
      (record.get('propositions') as Array<{ properties: Record<string, unknown> }>) ??
      []
    const includes =
      (record.get('includes') as Array<{ fromUid: string; toUid: string }>) ?? []
    const advances =
      (record.get('advances') as Array<{ fromUid: string; toUid: string }>) ?? []

    const viewpoints: NeoHubViewpoint[] = viewpointsRaw
      .filter((v) => v?.properties?.uid)
      .map((v) => ({
        uid: String(v.properties.uid),
        label: asString(v.properties.label) ?? asString(v.properties.name),
        summary: asString(v.properties.summary),
      }))

    const propositions: NeoHubProposition[] = propsRaw
      .filter((p) => p?.properties?.uid)
      .map((p) => ({
        uid: String(p.properties.uid),
        text: asString(p.properties.text),
        normalizedText: asString(p.properties.normalizedText),
        certainty: asString(p.properties.certainty),
      }))

    return {
      controversy: {
        uid: String(c.uid ?? uid),
        title: asString(c.title) ?? asString(c.label),
        summary: asString(c.summary),
      },
      viewpoints,
      propositions,
      propositionUids: propositions.map((p) => p.uid),
      includes: includes.filter((e) => e?.fromUid && e?.toUid),
      advances: advances.filter((e) => e?.fromUid && e?.toUid),
      title: asString(c.title) ?? asString(c.label),
      summary: asString(c.summary),
      found: true,
    }
  })
}

async function loadPropositionSpine(uid: string): Promise<RawHubBundle | null> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (p:Proposition {uid: $uid})
      OPTIONAL MATCH (v:Viewpoint)-[:ADVANCES]->(p)
      OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(v)
      OPTIONAL MATCH (p)-[r:RELATES_TO]-(peer:Proposition)
      WITH p, collect(DISTINCT v) AS vs, collect(DISTINCT c) AS cs,
           collect(DISTINCT peer) AS peers
      RETURN p, vs, cs, peers
      `,
      { uid }
    )
    const record = result.records[0]
    if (!record) return null
    const p = record.get('p')?.properties ?? {}
    const vs =
      (record.get('vs') as Array<{ properties: Record<string, unknown> }>) ?? []
    const cs =
      (record.get('cs') as Array<{ properties: Record<string, unknown> }>) ?? []
    const peers =
      (record.get('peers') as Array<{ properties: Record<string, unknown> }>) ?? []

    const rootProp: NeoHubProposition = {
      uid: String(p.uid ?? uid),
      text: asString(p.text),
      normalizedText: asString(p.normalizedText),
      certainty: asString(p.certainty),
    }
    const peerProps: NeoHubProposition[] = peers
      .filter((x) => x?.properties?.uid && String(x.properties.uid) !== rootProp.uid)
      .map((x) => ({
        uid: String(x.properties.uid),
        text: asString(x.properties.text),
        normalizedText: asString(x.properties.normalizedText),
        certainty: asString(x.properties.certainty),
      }))
    const propositions = [rootProp, ...peerProps]
    const viewpoints: NeoHubViewpoint[] = vs
      .filter((v) => v?.properties?.uid)
      .map((v) => ({
        uid: String(v.properties.uid),
        label: asString(v.properties.label) ?? asString(v.properties.name),
        summary: asString(v.properties.summary),
      }))
    const controversyNode = cs.find((c) => c?.properties?.uid)
    const controversy = controversyNode
      ? {
          uid: String(controversyNode.properties.uid),
          title:
            asString(controversyNode.properties.title) ??
            asString(controversyNode.properties.label),
          summary: asString(controversyNode.properties.summary),
        }
      : null

    const includes: Array<{ fromUid: string; toUid: string }> = []
    const advances: Array<{ fromUid: string; toUid: string }> = []
    if (controversy) {
      for (const v of viewpoints) {
        includes.push({ fromUid: controversy.uid, toUid: v.uid })
      }
    }
    for (const v of viewpoints) {
      advances.push({ fromUid: v.uid, toUid: rootProp.uid })
    }

    return {
      controversy,
      viewpoints,
      propositions,
      propositionUids: propositions.map((x) => x.uid),
      includes,
      advances,
      title: rootProp.text,
      summary: rootProp.normalizedText,
      found: true,
    }
  })
}

async function loadEntitySeed(uid: string): Promise<{
  entity: NeoHubEntity
  propositionUids: string[]
  title: string | null
} | null> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (e:Entity {uid: $uid})
      OPTIONAL MATCH (u:Utterance)-[:MENTIONS]->(e)
      OPTIONAL MATCH (u)-[:EXPRESSES]->(p:Proposition)
      OPTIONAL MATCH (a:Agent)-[:REFERRED_AS]->(e)
      OPTIONAL MATCH (ua:Utterance)-[:ASSERTED_BY]->(a)
      OPTIONAL MATCH (ua)-[:EXPRESSES]->(pa:Proposition)
      WITH e,
           collect(DISTINCT p.uid) + collect(DISTINCT pa.uid) AS propUids
      RETURN e, [x IN propUids WHERE x IS NOT NULL | x] AS propUids
      `,
      { uid }
    )
    const record = result.records[0]
    if (!record) return null
    const e = record.get('e')?.properties ?? {}
    const propUids = (record.get('propUids') as string[]) ?? []
    const entity: NeoHubEntity = {
      uid: String(e.uid ?? uid),
      name: asString(e.name),
      normalizedName: asString(e.normalizedName),
      kindHint: asString(e.kindHint),
    }
    return {
      entity,
      propositionUids: Array.from(new Set(propUids.map(String))),
      title: entity.name ?? entity.normalizedName,
    }
  })
}

async function expandNeighborhood(
  propositionUids: string[],
  entitySeed: NeoHubEntity | null,
  spine: {
    controversy: NeoHubGraph['controversy']
    viewpoints: NeoHubViewpoint[]
    propositions: NeoHubProposition[]
    includes: Array<{ fromUid: string; toUid: string }>
    advances: Array<{ fromUid: string; toUid: string }>
    title: string | null
    summary: string | null
  },
  rootKind: NeoHubRootKind,
  rootUid: string
): Promise<NeoHubGraph> {
  return withNeo4jSession(async (session) => {
    let queryTruncated = false
    const cappedPropUids = propositionUids.slice(0, HUB_MAX_PROPOSITIONS)
    if (propositionUids.length > HUB_MAX_PROPOSITIONS) queryTruncated = true

    const propByUid = new Map(spine.propositions.map((p) => [p.uid, p]))
    // Ensure capped set still has props from spine
    for (const uid of cappedPropUids) {
      if (!propByUid.has(uid)) {
        propByUid.set(uid, {
          uid,
          text: null,
          normalizedText: null,
          certainty: null,
        })
      }
    }
    let propositions = Array.from(propByUid.values()).filter((p) =>
      cappedPropUids.includes(p.uid)
    )
    if (propositions.length === 0 && cappedPropUids.length > 0) {
      propositions = cappedPropUids.map((uid) => ({
        uid,
        text: null,
        normalizedText: null,
        certainty: null,
      }))
    }

    const uttResult =
      cappedPropUids.length > 0
        ? await session.run(
            `
            MATCH (u:Utterance)-[ex:EXPRESSES]->(p:Proposition)
            WHERE p.uid IN $propUids
            OPTIONAL MATCH (u)-[gi:GROUNDED_IN]->(seg:Segment)
            OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
            RETURN
              u.uid AS uid,
              u.text AS text,
              u.speechAct AS speechAct,
              u.attributionMode AS attributionMode,
              u.polarity AS polarity,
              u.confidence AS confidence,
              u.documentUid AS documentUid,
              seg.uid AS segmentUid,
              coalesce(gi.charStart, u.charStart, 0) AS charStart,
              coalesce(gi.charEnd, u.charEnd, 0) AS charEnd,
              a.uid AS agentUid,
              a.name AS agentName,
              a.normalizedName AS agentNormalizedName,
              p.uid AS propositionUid
            `,
            { propUids: cappedPropUids }
          )
        : { records: [] }

    type UttRow = NeoHubUtterance & { propositionUid: string }
    const uttRows: UttRow[] = []
    for (const rec of uttResult.records) {
      const documentUid = asString(rec.get('documentUid'))
      const uid = asString(rec.get('uid'))
      const propositionUid = asString(rec.get('propositionUid'))
      if (!documentUid || !uid || !propositionUid) continue
      uttRows.push({
        uid,
        text: String(rec.get('text') ?? ''),
        speechAct: asString(rec.get('speechAct')),
        attributionMode: asString(rec.get('attributionMode')),
        polarity: asString(rec.get('polarity')),
        confidence:
          rec.get('confidence') == null
            ? null
            : asNumber(rec.get('confidence'), NaN) || null,
        documentUid,
        segmentUid: asString(rec.get('segmentUid')),
        charStart: asNumber(rec.get('charStart')),
        charEnd: asNumber(rec.get('charEnd')),
        agentUid: asString(rec.get('agentUid')),
        agentName: asString(rec.get('agentName')),
        propositionUid,
      })
    }

    // Entity hub: also pull utterances that mention / refer to the entity
    if (entitySeed) {
      const mentionResult = await session.run(
        `
        MATCH (e:Entity {uid: $entityUid})
        OPTIONAL MATCH (u:Utterance)-[:MENTIONS]->(e)
        OPTIONAL MATCH (a:Agent)-[ra:REFERRED_AS]->(e)
        OPTIONAL MATCH (ua:Utterance)-[:ASSERTED_BY]->(a)
        WITH collect(DISTINCT u) + collect(DISTINCT ua) AS utts, e
        UNWIND [x IN utts WHERE x IS NOT NULL | x] AS u
        OPTIONAL MATCH (u)-[gi:GROUNDED_IN]->(seg:Segment)
        OPTIONAL MATCH (u)-[:ASSERTED_BY]->(ag:Agent)
        RETURN DISTINCT
          u.uid AS uid,
          u.text AS text,
          u.speechAct AS speechAct,
          u.attributionMode AS attributionMode,
          u.polarity AS polarity,
          u.confidence AS confidence,
          u.documentUid AS documentUid,
          seg.uid AS segmentUid,
          coalesce(gi.charStart, u.charStart, 0) AS charStart,
          coalesce(gi.charEnd, u.charEnd, 0) AS charEnd,
          ag.uid AS agentUid,
          ag.name AS agentName
        `,
        { entityUid: entitySeed.uid }
      )
      const seen = new Set(uttRows.map((u) => u.uid))
      for (const rec of mentionResult.records) {
        const documentUid = asString(rec.get('documentUid'))
        const uid = asString(rec.get('uid'))
        if (!documentUid || !uid || seen.has(uid)) continue
        seen.add(uid)
        uttRows.push({
          uid,
          text: String(rec.get('text') ?? ''),
          speechAct: asString(rec.get('speechAct')),
          attributionMode: asString(rec.get('attributionMode')),
          polarity: asString(rec.get('polarity')),
          confidence:
            rec.get('confidence') == null
              ? null
              : asNumber(rec.get('confidence'), NaN) || null,
          documentUid,
          segmentUid: asString(rec.get('segmentUid')),
          charStart: asNumber(rec.get('charStart')),
          charEnd: asNumber(rec.get('charEnd')),
          agentUid: asString(rec.get('agentUid')),
          agentName: asString(rec.get('agentName')),
          propositionUid: '',
        })
      }
    }

    const diversified = diversifyByDocument(
      uttRows,
      HUB_MAX_UTTERANCES,
      HUB_MAX_DOCUMENTS
    )
    if (diversified.truncated) queryTruncated = true
    const utterances = diversified.kept
    const utteranceUids = new Set(utterances.map((u) => u.uid))
    const documentUids = Array.from(new Set(utterances.map((u) => u.documentUid)))

    const docResult =
      documentUids.length > 0
        ? await session.run(
            `
            MATCH (d:Document)
            WHERE d.uid IN $docUids
            RETURN d.uid AS uid, d.title AS title, d.url AS url
            `,
            { docUids: documentUids }
          )
        : { records: [] }

    const documents: NeoHubDocument[] = docResult.records.map((rec) => ({
      uid: String(rec.get('uid')),
      title: asString(rec.get('title')),
      url: asString(rec.get('url')),
    }))

    const agentsByUid = new Map<string, NeoHubAgent>()
    for (const u of utterances) {
      if (u.agentUid && !agentsByUid.has(u.agentUid)) {
        agentsByUid.set(u.agentUid, {
          uid: u.agentUid,
          name: u.agentName,
          normalizedName: null,
          documentUid: u.documentUid,
        })
      }
    }

    const edges: NeoHubEdge[] = []
    for (const e of spine.includes) {
      edges.push({ type: 'INCLUDES', fromUid: e.fromUid, toUid: e.toUid })
    }
    for (const e of spine.advances) {
      if (cappedPropUids.includes(e.toUid)) {
        edges.push({ type: 'ADVANCES', fromUid: e.fromUid, toUid: e.toUid })
      }
    }
    for (const u of utterances) {
      if (u.propositionUid && cappedPropUids.includes(u.propositionUid)) {
        edges.push({
          type: 'EXPRESSES',
          fromUid: u.uid,
          toUid: u.propositionUid,
        })
      }
      edges.push({
        type: 'GROUNDED_IN',
        fromUid: u.uid,
        toUid: u.documentUid,
      })
      if (u.agentUid) {
        edges.push({
          type: 'ASSERTED_BY',
          fromUid: u.uid,
          toUid: u.agentUid,
        })
      }
    }

    // RELATES_TO among capped propositions
    if (cappedPropUids.length > 0) {
      const relResult = await session.run(
        `
        MATCH (pa:Proposition)-[r:RELATES_TO]->(pb:Proposition)
        WHERE pa.uid IN $propUids AND pb.uid IN $propUids
        RETURN pa.uid AS fromUid, pb.uid AS toUid, r.relationshipType AS label
        LIMIT 200
        `,
        { propUids: cappedPropUids }
      )
      for (const rec of relResult.records) {
        const fromUid = asString(rec.get('fromUid'))
        const toUid = asString(rec.get('toUid'))
        if (!fromUid || !toUid) continue
        edges.push({
          type: 'RELATES_TO',
          fromUid,
          toUid,
          label: asString(rec.get('label')),
        })
      }
    }

    // Arguments with HAS_ROLE into capped props (document-local)
    const argumentsOut: NeoHubArgument[] = []
    if (cappedPropUids.length > 0 && documentUids.length > 0) {
      const argResult = await session.run(
        `
        MATCH (arg:Argument)-[hr:HAS_ROLE]->(p:Proposition)
        WHERE p.uid IN $propUids AND arg.documentUid IN $docUids
        RETURN arg.uid AS argUid,
               arg.documentUid AS documentUid,
               arg.summary AS summary,
               p.uid AS propUid,
               hr.role AS role
        LIMIT $limit
        `,
        {
          propUids: cappedPropUids,
          docUids: documentUids,
          limit: HUB_MAX_ARGUMENTS,
        }
      )
      const seenArgs = new Set<string>()
      for (const rec of argResult.records) {
        const argUid = asString(rec.get('argUid'))
        const propUid = asString(rec.get('propUid'))
        if (!argUid || !propUid) continue
        if (!seenArgs.has(argUid)) {
          seenArgs.add(argUid)
          argumentsOut.push({
            uid: argUid,
            documentUid: asString(rec.get('documentUid')),
            summary: asString(rec.get('summary')),
          })
        }
        edges.push({
          type: 'HAS_ROLE',
          fromUid: argUid,
          toUid: propUid,
          role: asString(rec.get('role')),
        })
      }
      if (argResult.records.length >= HUB_MAX_ARGUMENTS) queryTruncated = true
    }

    // Disputes concerning capped propositions
    const disputes: NeoHubDispute[] = []
    if (cappedPropUids.length > 0) {
      const disputeResult = await session.run(
        `
        MATCH (d:Dispute)-[:CONCERNS]->(p:Proposition)
        WHERE p.uid IN $propUids
        RETURN DISTINCT
          d.uid AS uid,
          d.label AS label,
          d.disputeType AS disputeType,
          collect(DISTINCT p.uid) AS propUids
        LIMIT 40
        `,
        { propUids: cappedPropUids }
      )
      for (const rec of disputeResult.records) {
        const uid = asString(rec.get('uid'))
        if (!uid) continue
        disputes.push({
          uid,
          label: asString(rec.get('label')),
          disputeType: asString(rec.get('disputeType')),
        })
        const concernProps = (rec.get('propUids') as string[]) ?? []
        for (const propUid of concernProps) {
          if (propUid && cappedPropUids.includes(String(propUid))) {
            edges.push({
              type: 'CONCERNS',
              fromUid: uid,
              toUid: String(propUid),
            })
          }
        }
      }
    }

    // Entities: seed + mentions from kept utterances + offices via REFERRED_AS
    const entitiesByUid = new Map<string, NeoHubEntity>()
    if (entitySeed) entitiesByUid.set(entitySeed.uid, entitySeed)

    if (utteranceUids.size > 0) {
      const mentionEdges = await session.run(
        `
        MATCH (u:Utterance)-[:MENTIONS]->(e:Entity)
        WHERE u.uid IN $uttUids
        RETURN u.uid AS fromUid, e.uid AS toUid,
               e.name AS name, e.normalizedName AS normalizedName, e.kindHint AS kindHint
        LIMIT $limit
        `,
        {
          uttUids: Array.from(utteranceUids),
          limit: HUB_MAX_ENTITIES * 4,
        }
      )
      for (const rec of mentionEdges.records) {
        const fromUid = asString(rec.get('fromUid'))
        const toUid = asString(rec.get('toUid'))
        if (!fromUid || !toUid) continue
        if (!entitiesByUid.has(toUid) && entitiesByUid.size < HUB_MAX_ENTITIES) {
          entitiesByUid.set(toUid, {
            uid: toUid,
            name: asString(rec.get('name')),
            normalizedName: asString(rec.get('normalizedName')),
            kindHint: asString(rec.get('kindHint')),
          })
        }
        if (entitiesByUid.has(toUid)) {
          edges.push({ type: 'MENTIONS', fromUid, toUid })
        }
      }

      const officeEdges = await session.run(
        `
        MATCH (u:Utterance)-[:ASSERTED_BY]->(a:Agent)-[r:REFERRED_AS]->(office:Entity)
        WHERE u.uid IN $uttUids
        RETURN DISTINCT a.uid AS fromUid, office.uid AS toUid,
               office.name AS name, office.normalizedName AS normalizedName,
               office.kindHint AS kindHint, r.title AS title
        LIMIT $limit
        `,
        {
          uttUids: Array.from(utteranceUids),
          limit: HUB_MAX_ENTITIES * 2,
        }
      )
      for (const rec of officeEdges.records) {
        const fromUid = asString(rec.get('fromUid'))
        const toUid = asString(rec.get('toUid'))
        if (!fromUid || !toUid) continue
        if (!entitiesByUid.has(toUid) && entitiesByUid.size < HUB_MAX_ENTITIES) {
          entitiesByUid.set(toUid, {
            uid: toUid,
            name: asString(rec.get('name')),
            normalizedName: asString(rec.get('normalizedName')),
            kindHint: asString(rec.get('kindHint')) ?? 'office',
          })
        }
        if (entitiesByUid.has(toUid)) {
          edges.push({
            type: 'REFERRED_AS',
            fromUid,
            toUid,
            title: asString(rec.get('title')),
          })
        }
      }
    }

    // Fill proposition text for any stubs
    const missingPropText = propositions.filter((p) => !p.text)
    if (missingPropText.length > 0) {
      const fill = await session.run(
        `
        MATCH (p:Proposition)
        WHERE p.uid IN $uids
        RETURN p.uid AS uid, p.text AS text, p.normalizedText AS normalizedText,
               p.certainty AS certainty
        `,
        { uids: missingPropText.map((p) => p.uid) }
      )
      const byUid = new Map(
        fill.records.map((rec) => [
          String(rec.get('uid')),
          {
            text: asString(rec.get('text')),
            normalizedText: asString(rec.get('normalizedText')),
            certainty: asString(rec.get('certainty')),
          },
        ])
      )
      propositions = propositions.map((p) => {
        const extra = byUid.get(p.uid)
        if (!extra) return p
        return {
          ...p,
          text: p.text ?? extra.text,
          normalizedText: p.normalizedText ?? extra.normalizedText,
          certainty: p.certainty ?? extra.certainty,
        }
      })
    }

    return {
      rootKind,
      rootUid,
      title: spine.title,
      summary: spine.summary,
      documents,
      viewpoints: spine.viewpoints,
      propositions,
      arguments: argumentsOut,
      disputes,
      entities: Array.from(entitiesByUid.values()),
      agents: Array.from(agentsByUid.values()),
      utterances: utterances.map(
        ({ propositionUid: _p, ...rest }) => rest
      ) as NeoHubUtterance[],
      controversy: spine.controversy,
      edges,
      queryTruncated,
      caps: {
        maxDocuments: HUB_MAX_DOCUMENTS,
        maxUtterances: HUB_MAX_UTTERANCES,
        maxPropositions: HUB_MAX_PROPOSITIONS,
      },
    }
  })
}

export async function getControversyHubGraph(
  uid: string
): Promise<NeoHubGraph | null> {
  const spine = await loadControversySpine(uid)
  if (!spine) return null
  return expandNeighborhood(
    spine.propositionUids,
    null,
    {
      controversy: spine.controversy,
      viewpoints: spine.viewpoints,
      propositions: spine.propositions,
      includes: spine.includes,
      advances: spine.advances,
      title: spine.title,
      summary: spine.summary,
    },
    'controversy',
    uid
  )
}

export async function getPropositionHubGraph(
  uid: string
): Promise<NeoHubGraph | null> {
  const spine = await loadPropositionSpine(uid)
  if (!spine) return null
  return expandNeighborhood(
    spine.propositionUids,
    null,
    {
      controversy: spine.controversy,
      viewpoints: spine.viewpoints,
      propositions: spine.propositions,
      includes: spine.includes,
      advances: spine.advances,
      title: spine.title,
      summary: spine.summary,
    },
    'proposition',
    uid
  )
}

export async function getEntityHubGraph(uid: string): Promise<NeoHubGraph | null> {
  const seed = await loadEntitySeed(uid)
  if (!seed) return null
  return expandNeighborhood(
    seed.propositionUids,
    seed.entity,
    {
      controversy: null,
      viewpoints: [],
      propositions: [],
      includes: [],
      advances: [],
      title: seed.title,
      summary: null,
    },
    'entity',
    uid
  )
}
