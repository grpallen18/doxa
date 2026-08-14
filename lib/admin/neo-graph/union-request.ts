import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { parseEntityUid } from '@/lib/admin/neo-graph/entity-search'
import {
  clampUnionStoryLimit,
  parseUnionStoryIds,
  UNION_DEFAULT_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import { getDocumentGraphsCached } from '@/lib/neo4j/document-graph-cache'
import { listDocumentUidsMentioningEntity } from '@/lib/neo4j/queries/entities'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import {
  createAdminClient,
  createClient,
  formatSupabaseAdminError,
} from '@/lib/supabase/server'

export type UnionStoryMode = 'all' | 'ids' | 'entity'

export type UnionStoryResolve = {
  storyIds: string[]
  mode: UnionStoryMode
  limit: number
  fresh: boolean
  entityUid: string | null
  /** Weak validator: story set + latest succeeded job time. */
  fingerprint: string
}

export type UnionLoadedDocument = {
  uid: string
  title: string | null
  found: boolean
  utteranceCount: number
  agentCount: number
}

function unionFingerprint(
  storyIds: string[],
  finishedAtById: Map<string, string>,
  entityUid?: string | null
): string {
  const h = createHash('sha1')
  h.update(entityUid ?? '')
  h.update('\n')
  h.update(String(storyIds.length))
  for (const id of storyIds) {
    h.update(id)
    h.update('\0')
    h.update(finishedAtById.get(id) ?? '')
    h.update('\n')
  }
  return `"${h.digest('hex')}"`
}

async function finishedAtForStoryIds(
  storyIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (storyIds.length === 0) return out
  const admin = createAdminClient()
  const chunkSize = 80
  for (let i = 0; i < storyIds.length; i += chunkSize) {
    const chunk = storyIds.slice(i, i + chunkSize)
    const { data, error } = await admin
      .from('graph_processing_jobs')
      .select('story_id, finished_at')
      .eq('status', 'succeeded')
      .in('story_id', chunk)
      .order('finished_at', { ascending: false, nullsFirst: false })
    if (error) throw new Error(formatSupabaseAdminError(error.message))
    for (const row of data ?? []) {
      const id = row.story_id as string
      if (!id || out.has(id)) continue
      out.set(id, String(row.finished_at ?? ''))
    }
  }
  return out
}

type SucceededStories = {
  storyIds: string[]
  finishedAtById: Map<string, string>
}

/**
 * Most recently written Neo graphs first (latest succeeded job `finished_at`),
 * then fall back to `published_at` if no jobs are available.
 */
export async function listSucceededStoryIds(limit: number): Promise<string[]> {
  const { storyIds } = await listSucceededStories(limit)
  return storyIds
}

async function listSucceededStories(limit: number): Promise<SucceededStories> {
  const capped = clampUnionStoryLimit(limit)
  const admin = createAdminClient()
  const finishedAtById = new Map<string, string>()

  const { data: jobs, error: jobsError } = await admin
    .from('graph_processing_jobs')
    .select('story_id, finished_at')
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(capped * 10, 2000))

  if (jobsError) {
    throw new Error(formatSupabaseAdminError(jobsError.message))
  }

  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (const job of jobs ?? []) {
    const id = job.story_id as string
    if (!id || seen.has(id)) continue
    seen.add(id)
    orderedIds.push(id)
    finishedAtById.set(id, String(job.finished_at ?? ''))
    if (orderedIds.length >= Math.min(capped * 3, 600)) break
  }

  const supabase = await createClient()

  if (orderedIds.length === 0) {
    const { data, error } = await supabase
      .from('stories')
      .select('story_id')
      .eq('graph_status', 'succeeded')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(capped)

    if (error) throw new Error(error.message)
    const storyIds = (data ?? []).map((row) => row.story_id as string)
    return { storyIds, finishedAtById }
  }

  const storyIds = await keepSucceededStoryIds(orderedIds, capped)
  return { storyIds, finishedAtById }
}

async function keepSucceededStoryIds(
  orderedIds: string[],
  limit: number
): Promise<string[]> {
  const capped = clampUnionStoryLimit(limit)
  if (orderedIds.length === 0) return []
  const supabase = await createClient()
  const succeeded = new Set<string>()
  const chunkSize = 80
  for (let i = 0; i < orderedIds.length; i += chunkSize) {
    const chunk = orderedIds.slice(i, i + chunkSize)
    const { data: stories, error } = await supabase
      .from('stories')
      .select('story_id')
      .eq('graph_status', 'succeeded')
      .in('story_id', chunk)

    if (error) throw new Error(error.message)
    for (const row of stories ?? []) {
      const id = row.story_id as string
      if (id) succeeded.add(id)
    }
  }
  return orderedIds.filter((id) => succeeded.has(id)).slice(0, capped)
}

async function listStoriesMentioningEntity(
  entityUid: string,
  limit: number
): Promise<SucceededStories> {
  const capped = clampUnionStoryLimit(limit)
  const neoIds = await listDocumentUidsMentioningEntity(
    entityUid,
    Math.min(capped * 3, 600)
  )
  const storyIds = await keepSucceededStoryIds(neoIds, capped)
  const finishedAtById = await finishedAtForStoryIds(storyIds)
  return { storyIds, finishedAtById }
}

async function resolveWithFingerprint(
  storyIds: string[],
  mode: UnionStoryMode,
  limit: number,
  fresh: boolean,
  finishedAtById?: Map<string, string>,
  entityUid: string | null = null
): Promise<UnionStoryResolve> {
  const times = finishedAtById ?? (await finishedAtForStoryIds(storyIds))
  return {
    storyIds,
    mode,
    limit,
    fresh,
    entityUid,
    fingerprint: unionFingerprint(storyIds, times, entityUid),
  }
}

export function isFreshFlag(value: unknown): boolean {
  return value === true || value === '1' || value === 'true'
}

export async function resolveUnionStoryIds(
  request: NextRequest
): Promise<UnionStoryResolve> {
  let limit = UNION_DEFAULT_STORIES

  if (request.method === 'POST') {
    let body: {
      storyIds?: unknown
      ids?: unknown
      all?: unknown
      limit?: unknown
      cap?: unknown
      fresh?: unknown
      entity?: unknown
      entityUid?: unknown
    }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return resolveWithFingerprint([], 'ids', limit, false, new Map())
    }

    limit = clampUnionStoryLimit(body.limit ?? body.cap ?? limit)
    const fresh = isFreshFlag(body.fresh)
    const entityUid = parseEntityUid(body.entityUid ?? body.entity)
    if (entityUid) {
      const listed = await listStoriesMentioningEntity(entityUid, limit)
      return resolveWithFingerprint(
        listed.storyIds,
        'entity',
        limit,
        fresh,
        listed.finishedAtById,
        entityUid
      )
    }
    if (body.all === true) {
      const listed = await listSucceededStories(limit)
      return resolveWithFingerprint(
        listed.storyIds,
        'all',
        limit,
        fresh,
        listed.finishedAtById
      )
    }
    const raw = body.storyIds ?? body.ids
    if (Array.isArray(raw)) {
      return resolveWithFingerprint(
        parseUnionStoryIds(raw.map(String).join(','), limit),
        'ids',
        limit,
        fresh
      )
    }
    if (typeof raw === 'string') {
      return resolveWithFingerprint(
        parseUnionStoryIds(raw, limit),
        'ids',
        limit,
        fresh
      )
    }
    return resolveWithFingerprint([], 'ids', limit, fresh, new Map())
  }

  const sp = request.nextUrl.searchParams
  limit = clampUnionStoryLimit(sp.get('limit') ?? sp.get('cap') ?? limit)
  const fresh = isFreshFlag(sp.get('fresh'))
  const entityUid = parseEntityUid(sp.get('entity') ?? sp.get('entityUid'))
  if (entityUid) {
    const listed = await listStoriesMentioningEntity(entityUid, limit)
    return resolveWithFingerprint(
      listed.storyIds,
      'entity',
      limit,
      fresh,
      listed.finishedAtById,
      entityUid
    )
  }
  if (sp.get('all') === '1' || sp.get('all') === 'true') {
    const listed = await listSucceededStories(limit)
    return resolveWithFingerprint(
      listed.storyIds,
      'all',
      limit,
      fresh,
      listed.finishedAtById
    )
  }
  return resolveWithFingerprint(
    parseUnionStoryIds(sp.get('ids'), limit),
    'ids',
    limit,
    fresh
  )
}

export async function loadUnionDocumentGraphs(
  storyIds: string[],
  fresh: boolean
): Promise<{
  graphs: NeoDocumentGraph[]
  missingIds: string[]
  documents: UnionLoadedDocument[]
}> {
  const graphs: NeoDocumentGraph[] = []
  const missingIds: string[] = []
  const documents: UnionLoadedDocument[] = []

  if (storyIds.length === 0) {
    return { graphs, missingIds, documents }
  }

  const fetched = await getDocumentGraphsCached(storyIds, { bypass: fresh })

  for (const id of storyIds) {
    const graph = fetched.get(id) ?? null
    if (!graph) {
      missingIds.push(id)
      documents.push({
        uid: id,
        title: null,
        found: false,
        utteranceCount: 0,
        agentCount: 0,
      })
      continue
    }
    graphs.push(graph)
    documents.push({
      uid: graph.document.uid,
      title: graph.document.title,
      found: true,
      utteranceCount: graph.utterances.length,
      agentCount: graph.agents.length,
    })
  }

  return { graphs, missingIds, documents }
}
