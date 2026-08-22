import { config } from 'dotenv'
import path from 'path'
import neo4j from 'neo4j-driver'

config({ path: path.join(process.cwd(), '.env.local') })

async function main() {
  const uri = process.env.NEO4J_URI?.trim()
  const user = process.env.NEO4J_USERNAME?.trim()
  const password = process.env.NEO4J_PASSWORD
  if (!uri || !user || !password) {
    throw new Error('Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in .env.local')
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
  })
  const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' })

  try {
    const countResult = await session.run(
      `MATCH (d:Decision {decisionType: 'proposition_relationship'}) RETURN count(d) AS n`
    )
    const n = Number(countResult.records[0]?.get('n') ?? 0)
    await session.run(
      `MATCH (d:Decision {decisionType: 'proposition_relationship'}) DETACH DELETE d`
    )
    console.log(`purged proposition_relationship decisions: ${n}`)
  } finally {
    await session.close()
    await driver.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
