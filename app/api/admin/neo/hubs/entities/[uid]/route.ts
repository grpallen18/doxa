import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getNeo4jConfig } from '@/lib/neo4j/server'
import { getEntityHubGraph } from '@/lib/neo4j/queries/hub'

type RouteParams = { params: Promise<{ uid: string }> }

/** Cross-story Entity hub subgraph from Neo4j. Admin only. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { uid: rawUid } = await params
  const uid = decodeURIComponent(rawUid || '')
  if (!uid) {
    return NextResponse.json(
      { data: null, error: { message: 'uid required' } },
      { status: 400 }
    )
  }

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
    const graph = await getEntityHubGraph(uid)
    if (!graph) {
      return NextResponse.json(
        { data: null, error: { message: 'No Entity found in Neo4j for this uid' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: graph, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
