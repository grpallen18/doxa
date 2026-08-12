import { NextRequest, NextResponse } from 'next/server'
import { projectUnionOntology } from '@/lib/admin/neo-graph/project-union-ontology'
import { UNION_MAX_STORIES } from '@/lib/admin/neo-graph/union-limits'
import {
  loadUnionDocumentGraphs,
  resolveUnionStoryIds,
} from '@/lib/admin/neo-graph/union-request'
import { requireAdmin } from '@/lib/auth'
import { getNeo4jConfig } from '@/lib/neo4j/server'
import {
  emptyUnionOntologyOverlay,
  getUnionOntologyOverlay,
} from '@/lib/neo4j/queries/union-ontology'

/** Ontology-island union (Union 2.0). Same story-cap contract as classic union. */
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
    const { graphs, missingIds, documents } = await loadUnionDocumentGraphs(
      storyIds,
      fresh
    )
    const overlay =
      graphs.length === 0
        ? emptyUnionOntologyOverlay()
        : await getUnionOntologyOverlay(graphs.map((g) => g.document.uid))
    const projection = projectUnionOntology(graphs, overlay, { missingIds })

    const res = NextResponse.json({
      data: {
        projection,
        documents,
        missingIds,
        caps: { maxStories: UNION_MAX_STORIES, limit },
        mode,
        storyCount: storyIds.length,
        communityCount: projection.communities?.length ?? 0,
      },
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

export async function POST(request: NextRequest) {
  return GET(request)
}
