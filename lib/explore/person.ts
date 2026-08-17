import { createClient } from '@/lib/supabase/server'
import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'
import type {
  ExploreControversyListItem,
  ExplorePersonProfile,
  PersonEidosGraph,
  PersonStats,
} from '@/lib/explore/types'

type Sb = Awaited<ReturnType<typeof createClient>>

const EMPTY_STATS: PersonStats = {
  coverage_30d: 0,
  coverage_prior_30d: 0,
  delta_pct: 0,
  fire_rating: 1,
  claim_count: 0,
  debate_count: 0,
  mention_count: 0,
  publisher_count: 0,
  document_count: 0,
}

const EMPTY_EIDOS: PersonEidosGraph = { nodes: [], edges: [] }

/** Strip PostgREST filter metacharacters (incl. apostrophes). */
function sanitizeSearchTerm(q: string): string {
  return q
    .trim()
    .replace(/[%_,.()']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asStats(value: unknown): PersonStats {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATS }
  const s = value as Record<string, unknown>
  return {
    coverage_30d: Number(s.coverage_30d) || 0,
    coverage_prior_30d: Number(s.coverage_prior_30d) || 0,
    delta_pct: Number(s.delta_pct) || 0,
    fire_rating: Math.max(1, Math.min(5, Math.round(Number(s.fire_rating) || 1))),
    claim_count: Number(s.claim_count) || 0,
    debate_count: Number(s.debate_count) || 0,
    mention_count: Number(s.mention_count) || 0,
    publisher_count: Number(s.publisher_count) || 0,
    document_count: Number(s.document_count) || 0,
  }
}

function asEidos(value: unknown): PersonEidosGraph {
  if (!value || typeof value !== 'object') return { ...EMPTY_EIDOS }
  const g = value as { nodes?: unknown; edges?: unknown }
  return {
    nodes: asArray(g.nodes),
    edges: asArray(g.edges),
  }
}

function mapControversies(raw: unknown): ExploreControversyListItem[] {
  return asArray<Record<string, unknown>>(raw)
    .map((c) => ({
      uid: String(c.uid ?? ''),
      question: String(c.question || c.title || 'Untitled').trim(),
      summary: (c.summary as string | null) ?? null,
      sides_count: Number(c.sides_count) || 0,
      source_count: Number(c.source_count) || 0,
      topic_key: (c.topic_key as string | null) ?? null,
      updated_at: String(c.updated_at ?? ''),
      topic_slug: null,
      topic_title: null,
    }))
    .filter((c) => c.uid)
}

async function controversiesForEntity(
  supabase: Sb,
  entityUid: string
): Promise<ExploreControversyListItem[]> {
  const { data: links } = await supabase
    .from('graph_controversy_subjects')
    .select('controversy_uid, weight')
    .eq('entity_uid', entityUid)
    .order('weight', { ascending: false })
    .limit(24)
  const uids = (links ?? []).map((r) => r.controversy_uid as string).filter(Boolean)
  if (!uids.length) return []
  const { data: rows } = await supabase
    .from('graph_controversies')
    .select('uid, title, question, summary, sides_count, source_count, topic_key, updated_at')
    .in('uid', uids)
    .eq('status', 'open')
  const byUid = new Map((rows ?? []).map((r) => [r.uid as string, r]))
  return uids
    .map((id): ExploreControversyListItem | null => {
      const r = byUid.get(id)
      if (!r) return null
      return {
        uid: id,
        question: String(r.question || r.title || 'Untitled debate').trim(),
        summary: (r.summary as string | null) ?? null,
        sides_count: Number(r.sides_count) || 0,
        source_count: Number(r.source_count) || 0,
        topic_key: (r.topic_key as string | null) ?? null,
        updated_at: String(r.updated_at ?? ''),
        topic_slug: null,
        topic_title: null,
      }
    })
    .filter((c): c is ExploreControversyListItem => c !== null)
}

export async function listPeople(
  supabase: Sb,
  limit = 40
): Promise<Array<{ uid: string; name: string; fire_rating: number; debate_count: number }>> {
  const { data } = await supabase
    .from('graph_people')
    .select('uid, name, stats')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => {
    const stats = asStats(r.stats)
    return {
      uid: r.uid as string,
      name: (r.name as string) || (r.uid as string),
      fire_rating: stats.fire_rating,
      debate_count: stats.debate_count,
    }
  })
}

async function neoPersonName(uid: string): Promise<{ name: string; normalized: string } | null> {
  if (!getNeo4jConfig()) return null
  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (e:Entity {uid: $uid})
      WHERE coalesce(e.kindHint, '') = 'person'
      RETURN coalesce(e.name, e.normalizedName, e.uid) AS name,
             coalesce(e.normalizedName, toLower(coalesce(e.name, '')), '') AS normalized
      `,
      { uid }
    )
    if (!result.records.length) return null
    const rec = result.records[0]
    return {
      name: String(rec.get('name') ?? uid),
      normalized: String(rec.get('normalized') ?? ''),
    }
  })
}

function skeletalProfile(uid: string, name: string, normalized: string | null): ExplorePersonProfile {
  return {
    uid,
    name,
    normalized_name: normalized,
    offices: [],
    stats: { ...EMPTY_STATS },
    publishers: [],
    recent_documents: [],
    controversies: [],
    sample_propositions: [],
    related_people: [],
    pulse: [],
    attributed_remarks: [],
    topics: [],
    eidos: { ...EMPTY_EIDOS },
    updated_at: null,
    projected: false,
  }
}

export async function getPersonProfile(uid: string): Promise<ExplorePersonProfile | null> {
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('graph_people')
    .select('*')
    .eq('uid', uid)
    .maybeSingle()

  if (row) {
    const fromJson = mapControversies(row.controversies)
    const fromIndex = await controversiesForEntity(supabase, uid)
    return {
      uid: row.uid as string,
      name: (row.name as string) || uid,
      normalized_name: (row.normalized_name as string | null) ?? null,
      offices: asArray(row.offices),
      stats: asStats(row.stats),
      publishers: asArray(row.publishers),
      recent_documents: asArray(row.recent_documents),
      controversies: fromIndex.length ? fromIndex : fromJson,
      sample_propositions: asArray(row.sample_propositions),
      related_people: asArray(row.related_people),
      pulse: asArray(row.pulse),
      attributed_remarks: asArray(row.attributed_remarks),
      topics: asArray(row.topics),
      eidos: asEidos(row.eidos),
      updated_at: (row.updated_at as string | null) ?? null,
      projected: true,
    }
  }

  const neo = await neoPersonName(uid)
  if (!neo) return null
  const skeletal = skeletalProfile(uid, neo.name, neo.normalized)
  skeletal.controversies = await controversiesForEntity(supabase, uid)
  return skeletal
}

export async function searchPeople(
  supabase: Sb,
  q: string,
  limit = 12
): Promise<Array<{ uid: string; name: string; fire_rating: number; debate_count: number }>> {
  const term = sanitizeSearchTerm(q)
  if (!term) return []
  const pattern = `%${term}%`
  const { data } = await supabase
    .from('graph_people')
    .select('uid, name, stats')
    .or(`name.ilike.${pattern},normalized_name.ilike.${pattern}`)
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => {
    const stats = asStats(r.stats)
    return {
      uid: r.uid as string,
      name: (r.name as string) || (r.uid as string),
      fire_rating: stats.fire_rating,
      debate_count: stats.debate_count,
    }
  })
}
