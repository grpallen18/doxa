import { NextRequest, NextResponse } from 'next/server'
import {
  ENTITY_SEARCH_LIMIT,
  ENTITY_SEARCH_MIN_CHARS,
} from '@/lib/admin/neo-graph/entity-search'
import { requireAdmin } from '@/lib/auth'
import { searchEntities } from '@/lib/neo4j/queries/entities'
import { getNeo4jConfig } from '@/lib/neo4j/server'

/** Entity typeahead for the Neo union graph. Admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  if (!getNeo4jConfig()) {
    return NextResponse.json(
      { data: null, error: { message: 'Neo4j is not configured on this server.' } },
      { status: 503 }
    )
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < ENTITY_SEARCH_MIN_CHARS) {
    return NextResponse.json({ data: { results: [] }, error: null })
  }

  const rawLimit = Number.parseInt(
    request.nextUrl.searchParams.get('limit') ?? '',
    10
  )
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, ENTITY_SEARCH_LIMIT))
    : ENTITY_SEARCH_LIMIT

  try {
    const results = await searchEntities(q, limit)
    return NextResponse.json({ data: { results }, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}
