/**
 * Remove smoke-test Questions (seededFromFixture) after L3 wipe.
 * Keeps gold registry Questions and L0–L2 atoms.
 */
import { config as loadDotenv } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadDotenv({ path: path.join(__dirname, '..', '.env.local') })

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  const username = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD?.trim()
  const database = process.env.NEO4J_DATABASE?.trim() || 'neo4j'
  if (!uri || !username || !password) {
    throw new Error('Missing NEO4J_* in .env.local')
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database })

  try {
    const before = await session.run(
      `MATCH (q:Question) WHERE q.seededFromFixture = true RETURN count(q) AS n`
    )
    const nBefore = Number(before.records[0]?.get('n') ?? 0)

    await session.run(`
      MATCH (q:Question)
      WHERE q.seededFromFixture = true
      OPTIONAL MATCH (d:Decision)-[:ABOUT]->(q)
      DETACH DELETE d, q
    `)

    await session.run(`
      MATCH (d:Decision)
      WHERE d.actor = 'fixture'
      DETACH DELETE d
    `)

    const after = await session.run(
      `MATCH (q:Question) WHERE q.seededFromFixture = true RETURN count(q) AS n`
    )
    const nAfter = Number(after.records[0]?.get('n') ?? 0)

    const remaining = await session.run(`MATCH (q:Question) RETURN count(q) AS n`)
    console.log(
      JSON.stringify(
        {
          fixture_questions_removed: nBefore - nAfter,
          fixture_questions_remaining: nAfter,
          questions_total: Number(remaining.records[0]?.get('n') ?? 0),
        },
        null,
        2
      )
    )
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
