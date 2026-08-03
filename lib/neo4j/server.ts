import neo4j, { type Driver } from 'neo4j-driver'

let driver: Driver | null = null

export function getNeo4jConfig() {
  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'

  if (!uri || !username || !password) {
    return null
  }

  return { uri, username, password, database }
}

export function getNeo4jDriver(): Driver {
  const config = getNeo4jConfig()
  if (!config) {
    throw new Error(
      'Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.'
    )
  }

  if (!driver) {
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      { disableLosslessIntegers: true }
    )
  }

  return driver
}

export function getNeo4jDatabase(): string {
  return getNeo4jConfig()?.database ?? 'neo4j'
}

export async function withNeo4jSession<T>(
  work: (session: ReturnType<Driver['session']>) => Promise<T>
): Promise<T> {
  const session = getNeo4jDriver().session({ database: getNeo4jDatabase() })
  try {
    return await work(session)
  } finally {
    await session.close()
  }
}
