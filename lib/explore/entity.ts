import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'
import { createClient } from '@/lib/supabase/server'
import type { ExploreControversyListItem, ExploreEntityDossier } from '@/lib/explore/types'

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

export async function getEntityDossier(uid: string): Promise<ExploreEntityDossier | null> {
  if (!getNeo4jConfig()) return null

  const entity = await withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (e:Entity {uid: $uid})
      OPTIONAL MATCH (u:Utterance)-[:MENTIONS]->(e)
      OPTIONAL MATCH (u)-[:EXPRESSES]->(p:Proposition)
      OPTIONAL MATCH (v:Viewpoint)-[:ADVANCES]->(p)
      OPTIONAL MATCH (c:Controversy)-[:INCLUDES]->(v)
      OPTIONAL MATCH (a:Agent)-[h:HELD_BY]->(p)
      WHERE a IS NULL OR true
      WITH e,
           collect(DISTINCT {
             propUid: p.uid,
             propText: coalesce(p.text, p.normalizedText, ''),
             controversyUid: c.uid
           }) AS props,
           collect(DISTINCT c.uid) AS ctrUids
      RETURN e.uid AS uid,
             coalesce(e.normalizedName, e.name, e.uid) AS name,
             coalesce(e.kind, e.type, null) AS kind,
             [x IN props WHERE x.propUid IS NOT NULL][0..40] AS propositions,
             [x IN ctrUids WHERE x IS NOT NULL] AS controversyUids
      `,
      { uid }
    )
    if (!result.records.length) return null
    const rec = result.records[0]
    return {
      uid: asString(rec.get('uid')) ?? uid,
      name: asString(rec.get('name')) ?? uid,
      kind: asString(rec.get('kind')),
      propositions: (rec.get('propositions') as Array<{
        propUid?: string
        propText?: string
        controversyUid?: string
      }> | null)?.map((p) => ({
        uid: p.propUid ?? '',
        text: p.propText ?? '',
        controversy_uid: p.controversyUid ?? null,
      })).filter((p) => p.uid) ?? [],
      controversyUids: (rec.get('controversyUids') as string[] | null) ?? [],
    }
  })

  if (!entity) return null

  let controversies: ExploreControversyListItem[] = []
  if (entity.controversyUids.length) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('graph_controversies')
      .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at')
      .in('uid', entity.controversyUids)
      .order('updated_at', { ascending: false })
    controversies = (data ?? []).map((r) => ({
      uid: r.uid as string,
      question: ((r.question as string) || (r.title as string) || 'Untitled').trim(),
      summary: (r.summary as string | null) ?? null,
      sides_count: Number(r.sides_count) || 0,
      source_count: Number(r.source_count) || 0,
      topic_key: (r.topic_key as string | null) ?? null,
      updated_at: r.updated_at as string,
      topic_slug: null,
      topic_title: null,
    }))
  }

  return {
    uid: entity.uid,
    name: entity.name,
    kind: entity.kind,
    propositions: entity.propositions,
    controversies,
  }
}
