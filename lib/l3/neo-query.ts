import { withNeo4jSession } from '@/lib/neo4j/server'

export async function runL3Cypher<T extends Record<string, unknown> = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(cypher, params)
    return result.records.map((r) => r.toObject() as T)
  })
}
