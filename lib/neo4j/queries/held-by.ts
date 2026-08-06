import { withNeo4jSession } from '@/lib/neo4j/server'

export type NeoHeldByInterval = {
  agentUid: string
  agentName: string | null
  propositionUid: string
  polarity: string | null
  validFrom: string | null
  validTo: string | null
  open: boolean
  documentUid: string | null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

export async function getHeldByForProposition(
  propositionUid: string
): Promise<NeoHeldByInterval[]> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (a:Agent)-[h:HELD_BY]->(p:Proposition {uid: $uid})
      RETURN a.uid AS agentUid,
             coalesce(a.name, a.normalizedName) AS agentName,
             p.uid AS propositionUid,
             h.polarity AS polarity,
             toString(h.validFrom) AS validFrom,
             toString(h.validTo) AS validTo,
             coalesce(h.open, h.validTo IS NULL) AS open,
             h.documentUid AS documentUid
      ORDER BY h.validFrom DESC
      LIMIT 40
      `,
      { uid: propositionUid }
    )
    return result.records.map((rec) => ({
      agentUid: asString(rec.get('agentUid')) ?? '',
      agentName: asString(rec.get('agentName')),
      propositionUid: asString(rec.get('propositionUid')) ?? propositionUid,
      polarity: asString(rec.get('polarity')),
      validFrom: asString(rec.get('validFrom')),
      validTo: asString(rec.get('validTo')),
      open: Boolean(rec.get('open')),
      documentUid: asString(rec.get('documentUid')),
    })).filter((r) => r.agentUid)
  })
}
