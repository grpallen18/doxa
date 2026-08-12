import { withNeo4jSession } from '@/lib/neo4j/server'

export type UnionOntologyControversy = {
  uid: string
  title: string | null
  summary: string | null
}

export type UnionOntologyViewpoint = {
  uid: string
  label: string | null
  summary: string | null
}

export type UnionOntologyDispute = {
  uid: string
  label: string | null
  disputeType: string | null
}

export type UnionOntologyEdge = {
  fromUid: string
  toUid: string
}

export type UnionOntologyOverlay = {
  controversies: UnionOntologyControversy[]
  viewpoints: UnionOntologyViewpoint[]
  disputes: UnionOntologyDispute[]
  includes: UnionOntologyEdge[]
  advances: UnionOntologyEdge[]
  concerns: UnionOntologyEdge[]
  relatesTo: UnionOntologyEdge[]
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function nodeProps(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const rec = raw as { properties?: Record<string, unknown> }
  if (rec.properties && typeof rec.properties === 'object') return rec.properties
  return raw as Record<string, unknown>
}

function edgePair(raw: unknown): UnionOntologyEdge | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as { fromUid?: unknown; toUid?: unknown }
  const fromUid = asString(rec.fromUid)
  const toUid = asString(rec.toUid)
  if (!fromUid || !toUid) return null
  return { fromUid, toUid }
}

export function emptyUnionOntologyOverlay(): UnionOntologyOverlay {
  return {
    controversies: [],
    viewpoints: [],
    disputes: [],
    includes: [],
    advances: [],
    concerns: [],
    relatesTo: [],
  }
}

/**
 * Multi-root controversy spine for a story-union document set.
 * Does not re-fetch utterances — only debate topology overlay.
 */
export async function getUnionOntologyOverlay(
  storyUids: string[]
): Promise<UnionOntologyOverlay> {
  const uids = [...new Set(storyUids.filter(Boolean))]
  if (uids.length === 0) return emptyUnionOntologyOverlay()

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (d:Document)
      WHERE d.uid IN $uids
      OPTIONAL MATCH (u:Utterance {documentUid: d.uid})-[:EXPRESSES]->(p:Proposition)
      OPTIONAL MATCH (v:Viewpoint)-[:ADVANCES]->(p)
      OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(v)
      OPTIONAL MATCH (disp:Dispute)-[:CONCERNS]->(p)
      OPTIONAL MATCH (p)-[:RELATES_TO]-(peer:Proposition)
      WITH
        collect(DISTINCT c) AS cs,
        collect(DISTINCT v) AS vs,
        collect(DISTINCT disp) AS ds,
        collect(DISTINCT CASE
          WHEN c IS NOT NULL AND v IS NOT NULL
          THEN {fromUid: c.uid, toUid: v.uid}
        END) AS includes,
        collect(DISTINCT CASE
          WHEN v IS NOT NULL AND p IS NOT NULL
          THEN {fromUid: v.uid, toUid: p.uid}
        END) AS advances,
        collect(DISTINCT CASE
          WHEN disp IS NOT NULL AND p IS NOT NULL
          THEN {fromUid: disp.uid, toUid: p.uid}
        END) AS concerns,
        collect(DISTINCT CASE
          WHEN p IS NOT NULL AND peer IS NOT NULL
          THEN {fromUid: p.uid, toUid: peer.uid}
        END) AS relates
      RETURN cs, vs, ds, includes, advances, concerns, relates
      `,
      { uids }
    )

    const record = result.records[0]
    if (!record) return emptyUnionOntologyOverlay()

    const controversies: UnionOntologyControversy[] = []
    const seenC = new Set<string>()
    for (const raw of (record.get('cs') as unknown[]) ?? []) {
      const p = nodeProps(raw)
      const uid = asString(p.uid)
      if (!uid || seenC.has(uid)) continue
      seenC.add(uid)
      controversies.push({
        uid,
        title: asString(p.title) ?? asString(p.label),
        summary: asString(p.summary),
      })
    }

    const viewpoints: UnionOntologyViewpoint[] = []
    const seenV = new Set<string>()
    for (const raw of (record.get('vs') as unknown[]) ?? []) {
      const p = nodeProps(raw)
      const uid = asString(p.uid)
      if (!uid || seenV.has(uid)) continue
      seenV.add(uid)
      viewpoints.push({
        uid,
        label: asString(p.label) ?? asString(p.name),
        summary: asString(p.summary),
      })
    }

    const disputes: UnionOntologyDispute[] = []
    const seenD = new Set<string>()
    for (const raw of (record.get('ds') as unknown[]) ?? []) {
      const p = nodeProps(raw)
      const uid = asString(p.uid)
      if (!uid || seenD.has(uid)) continue
      seenD.add(uid)
      disputes.push({
        uid,
        label: asString(p.label) ?? asString(p.title),
        disputeType: asString(p.disputeType) ?? asString(p.type),
      })
    }

    const uniqEdges = (raw: unknown[]): UnionOntologyEdge[] => {
      const out: UnionOntologyEdge[] = []
      const seen = new Set<string>()
      for (const item of raw) {
        const e = edgePair(item)
        if (!e) continue
        const key = `${e.fromUid}->${e.toUid}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(e)
      }
      return out
    }

    return {
      controversies,
      viewpoints,
      disputes,
      includes: uniqEdges((record.get('includes') as unknown[]) ?? []),
      advances: uniqEdges((record.get('advances') as unknown[]) ?? []),
      concerns: uniqEdges((record.get('concerns') as unknown[]) ?? []),
      relatesTo: uniqEdges((record.get('relates') as unknown[]) ?? []),
    }
  })
}
