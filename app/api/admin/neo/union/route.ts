import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  clampUnionStoryLimit,
  parseUnionStoryIds,
  projectUnionDocuments,
  UNION_DEFAULT_STORIES,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import { getDocumentGraphCached } from '@/lib/neo4j/document-graph-cache'
import { getNeo4jConfig } from '@/lib/neo4j/server'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import {
  createAdminClient,
  createClient,
  formatSupabaseAdminError,
} from '@/lib/supabase/server'

/**
 * Most recently written Neo graphs first (latest succeeded job `finished_at`),
 * then fall back to `published_at` if no jobs are available.
 */
async function listSucceededStoryIds(limit: number): Promise<string[]> {
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
    if (orderedIds.length >= capped * 3) break
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

  const { data: stories, error } = await supabase
    .from('stories')
    .select('story_id')
    .eq('graph_status', 'succeeded')
    .in('story_id', orderedIds)

  if (error) throw new Error(error.message)

  const succeeded = new Set(
    (stories ?? []).map((row) => row.story_id as string)
  )
  return orderedIds.filter((id) => succeeded.has(id)).slice(0, capped)
}

function isFreshFlag(value: unknown): boolean {
  return value === true || value === '1' || value === 'true'
}

async function resolveStoryIds(request: NextRequest): Promise<{
  storyIds: string[]
  mode: 'all' | 'ids'
  limit: number
  fresh: boolean
}> {
  let limit = UNION_DEFAULT_STORIES

  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as {
        storyIds?: unknown
        ids?: unknown
        all?: unknown
        limit?: unknown
        cap?: unknown
        fresh?: unknown
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
    } catch {
      return { storyIds: [], mode: 'ids', limit, fresh: false }
    }
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

async function buildUnionResponse(
  storyIds: string[],
  limit: number,
  fresh: boolean
) {
  if (storyIds.length === 0) {
    return {
      projection: projectUnionDocuments([]),
      documents: [] as Array<{
        uid: string
        title: string | null
        found: boolean
        utteranceCount: number
        agentCount: number
      }>,
      missingIds: [] as string[],
      caps: { maxStories: UNION_MAX_STORIES, limit },
    }
  }

  const results = await Promise.all(
    storyIds.map(async (id) => {
      const graph = await getDocumentGraphCached(id, { bypass: fresh })
      return { id, graph }
    })
  )

  const graphs: NeoDocumentGraph[] = []
  const missingIds: string[] = []
  const documents: Array<{
    uid: string
    title: string | null
    found: boolean
    utteranceCount: number
    agentCount: number
  }> = []

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

  return {
    projection: projectUnionDocuments(graphs, { missingIds }),
    documents,
    missingIds,
    caps: { maxStories: UNION_MAX_STORIES, limit },
  }
}

/** All-story (or explicit ids) union graph. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  if (!getNeo4jConfig()) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            'Neo4j is not configured on this server. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE.',
        },
      },
      { status: 503 }
    )
  }

  try {
    const { storyIds, mode, limit, fresh } = await resolveStoryIds(request)
    const data = await buildUnionResponse(storyIds, limit, fresh)
    const res = NextResponse.json({
      data: { ...data, mode, storyCount: storyIds.length },
      error: null,
    })
    if (process.env.NODE_ENV === 'development') {
      res.headers.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, max-age=0'
      )
    }
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

/** Same as GET; prefer POST with `{ all: true, limit }` for the full union. */
export async function POST(request: NextRequest) {
  return GET(request)
}
