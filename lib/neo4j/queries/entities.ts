import { withNeo4jSession } from '@/lib/neo4j/server'
import {
  ENTITY_SEARCH_LIMIT,
  type NeoEntitySuggestion,
} from '@/lib/admin/neo-graph/entity-search'

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

/** Typeahead: entities whose name contains `q`, ranked by mention count. */
export async function searchEntities(
  q: string,
  limit = ENTITY_SEARCH_LIMIT
): Promise<NeoEntitySuggestion[]> {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const capped = Math.max(1, Math.min(limit, ENTITY_SEARCH_LIMIT))

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (e:Entity)
      WHERE toLower(coalesce(e.normalizedName, '')) CONTAINS $q
         OR toLower(coalesce(e.name, '')) CONTAINS $q
      OPTIONAL MATCH (e)<-[m:MENTIONS]-()
      WITH e, count(m) AS mentions
      RETURN e.uid AS uid,
             coalesce(e.name, e.normalizedName, e.uid) AS name,
             e.kindHint AS kindHint,
             mentions
      ORDER BY mentions DESC, name ASC
      LIMIT toInteger($limit)
      `,
      { q: needle, limit: capped }
    )

    return result.records.map((rec) => ({
      uid: asString(rec.get('uid')) ?? '',
      name: asString(rec.get('name')) ?? '',
      kindHint: asString(rec.get('kindHint')),
      mentions: asNumber(rec.get('mentions')),
    })).filter((row) => row.uid && row.name)
  })
}

/**
 * Distinct document uids that mention the entity, most recent first
 * (document publishedAt, then utterance createdAt).
 */
export async function listDocumentUidsMentioningEntity(
  entityUid: string,
  limit: number
): Promise<string[]> {
  const capped = Math.max(1, Math.min(Math.floor(limit), 600))

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (e:Entity {uid: $uid})<-[:MENTIONS]-(u:Utterance)
      WHERE u.documentUid IS NOT NULL
      OPTIONAL MATCH (d:Document {uid: u.documentUid})
      WITH u.documentUid AS storyId,
           max(coalesce(toString(d.publishedAt), toString(u.createdAt))) AS latest
      RETURN storyId
      ORDER BY coalesce(latest, '0000-01-01') DESC
      LIMIT toInteger($limit)
      `,
      { uid: entityUid, limit: capped }
    )

    const ids: string[] = []
    const seen = new Set<string>()
    for (const rec of result.records) {
      const id = asString(rec.get('storyId'))
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    return ids
  })
}
