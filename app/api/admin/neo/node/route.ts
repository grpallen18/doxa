import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getNeo4jConfig } from '@/lib/neo4j/server'
import { getNeoNodeDetail } from '@/lib/neo4j/queries/node-detail'

/** Lazy full-text / property fetch for the Neo detail drawer. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  if (!getNeo4jConfig()) {
    return NextResponse.json(
      { data: null, error: { message: 'Neo4j is not configured on this server.' } },
      { status: 503 }
    )
  }

  const nodeId = request.nextUrl.searchParams.get('id')?.trim() ?? ''
  if (!nodeId) {
    return NextResponse.json(
      { data: null, error: { message: 'id required' } },
      { status: 400 }
    )
  }

  try {
    const detail = await getNeoNodeDetail(nodeId)
    if (!detail) {
      return NextResponse.json(
        { data: null, error: { message: 'Node not found' } },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: detail, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
