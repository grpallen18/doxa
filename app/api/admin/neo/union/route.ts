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

function withEtag(res: NextResponse, etag: string): NextResponse {
  res.headers.set('ETag', etag)
  res.headers.set('Cache-Control', 'private, no-cache')
  return res
}

/** Neo union graph — ontology islands across succeeded story graphs. */
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
    const { storyIds, mode, limit, fresh, fingerprint } =
      await resolveUnionStoryIds(request)
    const inm = request.headers.get('if-none-match')
    if (!fresh && inm && inm === fingerprint && storyIds.length > 0) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: fingerprint,
          'Cache-Control': 'private, no-cache',
        },
      })
    }

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
    return withEtag(res, fingerprint)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
