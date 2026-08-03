import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  parseUnionStoryIds,
  projectUnionDocuments,
  UNION_MAX_STORIES,
} from '@/lib/admin/neo-graph/project-union'
import { getDocumentGraph } from '@/lib/neo4j/queries/phase0'
import { getNeo4jConfig } from '@/lib/neo4j/server'
import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'

async function resolveStoryIds(request: NextRequest): Promise<string[]> {
  if (request.method === 'POST') {
    try {
      const body = (await request.json()) as { storyIds?: unknown; ids?: unknown }
      const raw = body.storyIds ?? body.ids
      if (Array.isArray(raw)) {
        return parseUnionStoryIds(raw.map(String).join(','))
      }
      if (typeof raw === 'string') return parseUnionStoryIds(raw)
    } catch {
      return []
    }
  }
  return parseUnionStoryIds(request.nextUrl.searchParams.get('ids'))
}

async function buildUnionResponse(storyIds: string[]) {
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
      caps: { maxStories: UNION_MAX_STORIES },
    }
  }

  const results = await Promise.all(
    storyIds.map(async (id) => {
      const graph = await getDocumentGraph(id)
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
    caps: { maxStories: UNION_MAX_STORIES },
  }
}

/** Manual multi-story union graph. Admin only. */
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
    const storyIds = await resolveStoryIds(request)
    const data = await buildUnionResponse(storyIds)
    return NextResponse.json({ data, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Neo4j query failed'
    return NextResponse.json({ data: null, error: { message } }, { status: 500 })
  }
}

/** Same as GET; prefer POST when composing many UUIDs. */
export async function POST(request: NextRequest) {
  return GET(request)
}
