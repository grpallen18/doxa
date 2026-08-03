/**
 * Neo4j driver helpers for Deno Edge Functions (debate pipeline).
 * Env: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, optional NEO4J_DATABASE.
 */

import neo4j, { type Driver, type Session } from "npm:neo4j-driver@5.28.1";

let driver: Driver | null = null;

export function getNeo4jEnv() {
  const uri = Deno.env.get("NEO4J_URI")?.trim();
  const username = Deno.env.get("NEO4J_USERNAME")?.trim();
  const password = Deno.env.get("NEO4J_PASSWORD")?.trim();
  const database = Deno.env.get("NEO4J_DATABASE")?.trim() || "neo4j";
  if (!uri || !username || !password) return null;
  return { uri, username, password, database };
}

export function getNeo4jDriver(): Driver {
  const config = getNeo4jEnv();
  if (!config) {
    throw new Error("Neo4j not configured (NEO4J_URI / USERNAME / PASSWORD)");
  }
  if (!driver) {
    driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
      { disableLosslessIntegers: true }
    );
  }
  return driver;
}

export async function withNeoSession<T>(
  work: (session: Session) => Promise<T>
): Promise<T> {
  const config = getNeo4jEnv();
  if (!config) throw new Error("Neo4j not configured");
  const session = getNeo4jDriver().session({ database: config.database });
  try {
    return await work(session);
  } finally {
    await session.close();
  }
}

export async function runCypher<T extends Record<string, unknown> = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  return withNeoSession(async (session) => {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  });
}
