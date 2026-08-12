import { NextRequest, NextResponse } from 'next/server'
import {
  projectUnionDocuments,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import {
  loadUnionDocumentGraphs,
  resolveUnionStoryIds,
} from '@/lib/admin/neo-graph/union-request'
import { requireAdmin } from '@/lib/auth'
import { getNeo4jConfig } from '@/lib/neo4j/server'

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

  const { graphs, missingIds, documents } = await loadUnionDocumentGraphs(
    storyIds,
    fresh
  )

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
    const { storyIds, mode, limit, fresh } = await resolveUnionStoryIds(request)
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
