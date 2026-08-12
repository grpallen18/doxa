import { NextRequest } from 'next/server'
import {
  clampUnionStoryLimit,
  parseUnionStoryIds,
  UNION_DEFAULT_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import { getDocumentGraphCached } from '@/lib/neo4j/document-graph-cache'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import {
  createAdminClient,
  createClient,
  formatSupabaseAdminError,
} from '@/lib/supabase/server'

export type UnionStoryResolve = {
  storyIds: string[]
  mode: 'all' | 'ids'
  limit: number
  fresh: boolean
}

export type UnionLoadedDocument = {
  uid: string
  title: string | null
  found: boolean
  utteranceCount: number
  agentCount: number
}

/**
 * Most recently written Neo graphs first (latest succeeded job `finished_at`),
 * then fall back to `published_at` if no jobs are available.
 */
export async function listSucceededStoryIds(limit: number): Promise<string[]> {
  const capped = clampUnionStoryLimit(limit)
  const admin = createAdminClient()

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
    // Extra candidates so graph_status filter can drop a few without under-filling.
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
    return (data ?? []).map((row) => row.story_id as string)
  }

  // Batch `.in()` — large id lists blow PostgREST URL limits and used to
  // surface as an empty union ("No stories to union yet").
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
    }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return { storyIds: [], mode: 'ids', limit, fresh: false }
    }

    limit = clampUnionStoryLimit(body.limit ?? body.cap ?? limit)
    const fresh = isFreshFlag(body.fresh)
    if (body.all === true) {
      return {
        storyIds: await listSucceededStoryIds(limit),
        mode: 'all',
        limit,
        fresh,
      }
    }
    const raw = body.storyIds ?? body.ids
    if (Array.isArray(raw)) {
      return {
        storyIds: parseUnionStoryIds(raw.map(String).join(','), limit),
        mode: 'ids',
        limit,
        fresh,
      }
    }
    if (typeof raw === 'string') {
      return {
        storyIds: parseUnionStoryIds(raw, limit),
        mode: 'ids',
        limit,
        fresh,
      }
    }
    return { storyIds: [], mode: 'ids', limit, fresh }
  }

  const sp = request.nextUrl.searchParams
  limit = clampUnionStoryLimit(sp.get('limit') ?? sp.get('cap') ?? limit)
  const fresh = isFreshFlag(sp.get('fresh'))
  if (sp.get('all') === '1' || sp.get('all') === 'true') {
    return {
      storyIds: await listSucceededStoryIds(limit),
      mode: 'all',
      limit,
      fresh,
    }
  }
  return {
    storyIds: parseUnionStoryIds(sp.get('ids'), limit),
    mode: 'ids',
    limit,
    fresh,
  }
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

  const results = await Promise.all(
    storyIds.map(async (id) => {
      const graph = await getDocumentGraphCached(id, { bypass: fresh })
      return { id, graph }
    })
  )

  for (const { id, graph } of results) {
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
